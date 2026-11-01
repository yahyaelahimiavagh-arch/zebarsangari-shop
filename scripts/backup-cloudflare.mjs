#!/usr/bin/env node
// READ-ONLY production backup. Never commit the output or API tokens.
// Run from repository root: node scripts/backup-cloudflare.mjs
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir,readFile,stat,writeFile,unlink} from "node:fs/promises";
import {resolve,join} from "node:path";

const dryRun=process.argv.includes("--dry-run");
const root=resolve(import.meta.dirname,"..");
const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const output=resolve(root,"private-backups","zebarsangari-"+stamp);
const account=process.env.CF_ACCOUNT_ID||process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN||process.env.CF_API_TOKEN;
const config=await readFile(join(root,"wrangler.jsonc"),"utf8");
const namespace=process.env.CF_KV_NAMESPACE_ID||
 config.match(/"binding"\s*:\s*"IMAGES"\s*,\s*"id"\s*:\s*"([a-f0-9]{32})"/)?.[1];
const database=config.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
function ensure(condition,message){if(!condition)throw Error(message);}
function checksum(data){return createHash("sha256").update(data).digest("hex");}
async function cloudflare(path){
 const res=await fetch("https://api.cloudflare.com/client/v4"+path,{
  headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(30000)
 });
 ensure(res.ok,"Cloudflare API request failed: HTTP "+res.status);
 return res;
}
async function run(command,args,env={}){
 await new Promise((accept,reject)=>{
  const process=spawn(command,args,{cwd:root,env:{...globalThis.process.env,...env},stdio:"inherit",shell:false});
  process.once("error",reject);
  process.once("close",code=>code===0?accept():reject(Error("Command failed with status "+code)));
 });
}
async function backup(){
 ensure(database,"Database name is missing from wrangler.jsonc");
 ensure(namespace,"KV namespace ID is missing from wrangler.jsonc");
 if(dryRun){
  console.log("DRY RUN: read-only Cloudflare D1 SQL export + IMAGES KV key/value export.");
  console.log("Output directory:",output);
  console.log("Required env: CF_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.");
  console.log("No network call or backup was created.");
  return;
 }
 ensure(account,"Set CF_ACCOUNT_ID to your Cloudflare account ID (locally, not in GitHub).");
 ensure(token,"Set CLOUDFLARE_API_TOKEN (with D1 and KV Read permissions) locally.");
 await mkdir(output,{recursive:true,mode:0o700});
 const incomplete=join(output,"INCOMPLETE.txt");
 await writeFile(incomplete,"Backup incomplete. Do not use for restore.\n");
 console.log("Exporting D1: export may temporarily block other database requests. Run off-peak.");
 // The Wrangler command exports schema and rows, using the existing config/credentials.
 await run(process.platform==="win32"?"npx.cmd":"npx",[
  "--yes","wrangler","d1","export",database,"--remote","--output="+join(output,"database.sql")
 ],{CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account});
 const sqlStat=await stat(join(output,"database.sql"));
 ensure(sqlStat.size>0,"D1 export is empty. Aborting.");
 const kvDirectory=join(output,"kv");
 await mkdir(kvDirectory,{recursive:true,mode:0o700});
 const base="/accounts/"+encodeURIComponent(account)+"/storage/kv/namespaces/"+encodeURIComponent(namespace);
 const keys=[];
 let cursor="",pages=0;
 do{
  const url=base+"/keys?limit=1000"+(cursor?"&cursor="+encodeURIComponent(cursor):"");
  const payload=await (await cloudflare(url)).json();
  ensure(payload.success && Array.isArray(payload.result),"Invalid Cloudflare KV listing response.");
  keys.push(...payload.result);
  const next=payload.result_info?.cursor||"";
  ensure(next!==cursor || !next,"KV pagination cursor repeated.");
  cursor=next;
  if(++pages>10000)throw Error("Too many KV key-list pages.");
 }while(cursor);
 const entries=[];
 for(let i=0;i<keys.length;i++){
  const item=keys[i];
  ensure(typeof item.name==="string","Invalid KV key name.");
  const bytes=new Uint8Array(await (await cloudflare(base+"/values/"+encodeURIComponent(item.name))).arrayBuffer());
  const file=checksum(Buffer.from(item.name,"utf8"))+".bin";
  await writeFile(join(kvDirectory,file),bytes,{flag:"wx",mode:0o600});
  entries.push({key:item.name,file,bytes:bytes.length,sha256:checksum(bytes),
    ...(item.expiration?{expiration:item.expiration}:{}),
    ...(item.metadata!==undefined?{metadata:item.metadata}:{})});
  if((i+1)%25===0)console.log("KV backed up:",i+1,"/",keys.length);
 }
 const manifest={format:"zebarsangari-backup-v1",createdAt:new Date().toISOString(),
  database,sqlBytes:sqlStat.size,kvNamespace:namespace,kvCount:entries.length,entries};
 await writeFile(join(output,"manifest.json"),JSON.stringify(manifest,null,2),{mode:0o600});
 await unlink(incomplete);
 console.log("COMPLETE:",output);
 console.log("Files:",entries.length,"D1 bytes:",sqlStat.size);
 console.log("Keep this backup on encrypted storage; NEVER upload to a public GitHub repository.");
}
backup().catch(error=>{
 console.error("Backup FAILED:",error.message);
 console.error("If a partial folder exists, it is NOT a restorable backup.");
 process.exitCode=1;
});
