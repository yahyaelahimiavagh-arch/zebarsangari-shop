#!/usr/bin/env node
// Offline validation only. Does not access Cloudflare, modify data, or print PII.
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {readFile,stat,access} from "node:fs/promises";
import {resolve,join} from "node:path";
async function digest(path){
 const h=createHash("sha256");
 for await(const buffer of createReadStream(path))h.update(buffer);
 return h.digest("hex");
}
async function verify(folder){
 const root=resolve(folder);
 try{await access(join(root,"INCOMPLETE.txt"));throw Error("Backup is marked INCOMPLETE");}
 catch(e){if(e.code!=="ENOENT")throw e;}
 const m=JSON.parse(await readFile(join(root,"manifest.json"),"utf8"));
 if(m.format!=="zebarsangari-backup-v1")throw Error("Wrong manifest format");
 const sql=await stat(join(root,"database.sql"));
 if(sql.size===0 || sql.size!==m.sqlBytes)throw Error("Invalid SQL export size");
 if(await digest(join(root,"database.sql"))!==m.sqlSha256)throw Error("SQL checksum mismatch");
 if(!Array.isArray(m.entries)||m.kvCount!==m.entries.length)throw Error("KV manifest count mismatch");
 const seen=new Set();
 for(const item of m.entries){
  if(typeof item.file!=="string"||!/^[0-9a-f]{64}\.bin$/.test(item.file))throw Error("Invalid backup filename");
  if(seen.has(item.file))throw Error("Duplicated backup file");
  seen.add(item.file);
  const f=join(root,"kv",item.file);
  const st=await stat(f);
  if(st.size!==item.bytes || await digest(f)!==item.sha256)throw Error("A KV file failed integrity check");
 }
 console.log("VERIFIED: SQL export and",m.kvCount,"KV files match manifest.");
 console.log("Reminder: a separate restore rehearsal to a TEST database is still required.");
}
if(!process.argv[2]){console.error("Usage: node scripts/verify-backup.mjs private-backups/zebarsangari-<timestamp>");process.exitCode=1;}
else verify(process.argv[2]).catch(e=>{console.error("Verification failed:",e.message);process.exitCode=1;});
