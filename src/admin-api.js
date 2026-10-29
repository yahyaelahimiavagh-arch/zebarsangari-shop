// Secure single-owner catalog administration for Cloudflare Workers.
// Production activation requires ADMIN_PASSWORD and SESSION_SECRET (Worker secrets),
// the D1 login-attempts migration, and an optional IMAGES KV namespace.
// Never commit credentials to GitHub.
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
const CATEGORIES = new Set(["women","men","kids","socks","accessories"]);
const encoder = new TextEncoder();
const respond = (data, status=200, extra={}) =>
  new Response(JSON.stringify(data), {status, headers:{...JSON_HEADERS,...extra}});
const b64u = bytes => {
  let s = "";
  for(const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
};
const fromB64u = s => {
  const raw=atob(s.replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const sign = async (secret, data) => {
  const key = await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(data))));
};
const secureEqual = async (a,b) => {
  // Compare fixed-length digests rather than branching on the password text.
  const [x,y] = await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(a)),crypto.subtle.digest("SHA-256",encoder.encode(b))]);
  const u=new Uint8Array(x),v=new Uint8Array(y);
  let mismatch=0;
  for(let i=0;i<u.length;i++) mismatch |= u[i]^v[i];
  return mismatch===0;
};
const cookieString = (value, age=21600) =>
  "__Host-zs_session="+value+"; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age="+age;
const cookieValue = request => {
  const cookie=request.headers.get("cookie")||"";
  return cookie.match(/(?:^|;\s*)__Host-zs_session=([^;]+)/)?.[1] || "";
};
const originAllowed = request => request.headers.get("origin") === new URL(request.url).origin &&
  request.headers.get("sec-fetch-site") !== "cross-site";
async function issueSession(secret) {
  const now=Math.floor(Date.now()/1000);
  const payload=b64u(encoder.encode(JSON.stringify({iat:now,exp:now+21600,csrf:crypto.randomUUID()})));
  return payload+"."+await sign(secret,payload);
}
async function readSession(request,secret) {
  const token=cookieValue(request);
  const dot=token.indexOf(".");
  if(dot<1 || token.length>1024) return null;
  const payload=token.slice(0,dot), sig=token.slice(dot+1);
  if(!await secureEqual(sig,await sign(secret,payload))) return null;
  try {
    const value=JSON.parse(new TextDecoder().decode(fromB64u(payload)));
    const now=Math.floor(Date.now()/1000);
    if(typeof value.exp!=="number"||value.exp<now||value.iat>now+10||value.exp-value.iat>21600||typeof value.csrf!=="string") return null;
    return value;
  } catch {return null;}
}
async function readJson(request) {
  if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json")) throw new Error("invalid_content_type");
  const input=await request.text();
  if(input.length>24000) throw new Error("payload_too_large");
  return JSON.parse(input);
}
const bounded = (value,max) => typeof value==="string"?value.trim().slice(0,max):"";
const int = (value,min,max) => Number.isSafeInteger(Number(value)) && Number(value)>=min && Number(value)<=max ? Number(value):null;
function validateProduct(input) {
  const title=bounded(input.title,180);
  const description=bounded(input.description,4000);
  const category=input.category;
  const price=int(input.priceToman,0,10000000000);
  const compare=input.compareAtToman===null || input.compareAtToman==="" || input.compareAtToman===undefined
    ? null : int(input.compareAtToman,0,10000000000);
  if(!title||!CATEGORIES.has(category)||price===null||(compare===null && input.compareAtToman!==null && input.compareAtToman!=="" && input.compareAtToman!==undefined))
    throw new Error("invalid_product");
  if(!Array.isArray(input.variants)||input.variants.length<1||input.variants.length>30) throw new Error("invalid_variants");
  const seen=new Set(),variants=[];
  for(const v of input.variants) {
    const size=bounded(v.size,24), color=bounded(v.color,48);
    const stock=int(v.stock,0,1000000);
    if(!size||!color||stock===null) throw new Error("invalid_variant");
    const key=JSON.stringify([size,color]);
    if(seen.has(key)) throw new Error("duplicate_variant");
    seen.add(key); variants.push({id:crypto.randomUUID(),size,color,stock});
  }
  return {title,description,category,price,compare,active:input.active===true,variants};
}
async function ownerIpKey(request,secret) {
  const addr=request.headers.get("CF-Connecting-IP")||"unknown";
  const h=await crypto.subtle.digest("SHA-256",encoder.encode(secret+"|"+addr));
  return b64u(new Uint8Array(h));
}
async function failedLogins(env,key) {
  const now=Date.now();
  const row=await env.DB.prepare("SELECT failure_count, window_start_ms, blocked_until_ms FROM admin_login_attempts WHERE ip_hash=?").bind(key).first();
  if(row && row.blocked_until_ms>now) return {blocked:true};
  return {blocked:false,count:row && now-row.window_start_ms<900000?row.failure_count:0,window:row && now-row.window_start_ms<900000?row.window_start_ms:now};
}
async function recordFailure(env,key) {
  // Atomic increment: simultaneous guesses cannot reset the failure counter.
  const now=Date.now();
  const sql = "INSERT INTO admin_login_attempts(ip_hash,failure_count,window_start_ms,blocked_until_ms) VALUES(?,1,?,0) " +
    "ON CONFLICT(ip_hash) DO UPDATE SET " +
    "failure_count=CASE WHEN excluded.window_start_ms-admin_login_attempts.window_start_ms>=900000 THEN 1 ELSE admin_login_attempts.failure_count+1 END, " +
    "window_start_ms=CASE WHEN excluded.window_start_ms-admin_login_attempts.window_start_ms>=900000 THEN excluded.window_start_ms ELSE admin_login_attempts.window_start_ms END, " +
    "blocked_until_ms=CASE WHEN excluded.window_start_ms-admin_login_attempts.window_start_ms>=900000 THEN 0 WHEN admin_login_attempts.failure_count+1>=5 THEN excluded.window_start_ms+900000 ELSE admin_login_attempts.blocked_until_ms END";
  await env.DB.prepare(sql).bind(key,now).run();
}
function requireCsrf(request,session) {
  return originAllowed(request) && request.headers.get("x-csrf-token")===session.csrf;
}
async function listProducts(env,offset) {
  const q=await env.DB.prepare("SELECT id,slug,title_fa,description_fa,category,price_toman,compare_at_toman,active FROM products ORDER BY updated_at DESC LIMIT 60 OFFSET ?").bind(offset).all();
  const products=q.results||[];
  if(!products.length) return respond({products:[],count:0});
  const ids=products.map(p=>p.id),slots=ids.map(()=>"?").join(",");
  const [v,i]=await Promise.all([
    env.DB.prepare("SELECT id,product_id,size_label,color_label,stock FROM product_variants WHERE product_id IN ("+slots+") ORDER BY size_label,color_label").bind(...ids).all(),
    env.DB.prepare("SELECT id,product_id,object_key,alt_fa,position FROM product_images WHERE product_id IN ("+slots+") ORDER BY position").bind(...ids).all()
  ]);
  const variantById=new Map(ids.map(id=>[id,[]])), imageById=new Map(ids.map(id=>[id,[]]));
  for(const item of v.results||[]) variantById.get(item.product_id)?.push({id:item.id,size:item.size_label,color:item.color_label,stock:item.stock});
  for(const item of i.results||[]) imageById.get(item.product_id)?.push({id:item.id,url:"/media/"+item.object_key,alt:item.alt_fa,position:item.position});
  return respond({count:products.length,products:products.map(p=>({
    id:p.id,slug:p.slug,title:p.title_fa,description:p.description_fa,category:p.category,
    priceToman:p.price_toman,compareAtToman:p.compare_at_toman,active:!!p.active,
    variants:variantById.get(p.id),images:imageById.get(p.id)
  }))});
}
async function insertProduct(env,data,id=null) {
  const p=validateProduct(data);
  const editing=Boolean(id);
  if(editing) {
    const exists=await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(id).first();
    if(!exists) return respond({error:"not_found"},404);
  } else id=crypto.randomUUID();
  const stmts=[];
  if(editing) {
    stmts.push(env.DB.prepare("UPDATE products SET title_fa=?,description_fa=?,category=?,price_toman=?,compare_at_toman=?,active=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
      .bind(p.title,p.description,p.category,p.price,p.compare,p.active?1:0,id));
    stmts.push(env.DB.prepare("DELETE FROM product_variants WHERE product_id=?").bind(id));
  } else {
    stmts.push(env.DB.prepare("INSERT INTO products(id,slug,title_fa,description_fa,category,price_toman,compare_at_toman,active) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id,"p-"+id,p.title,p.description,p.category,p.price,p.compare,p.active?1:0));
  }
  for(const v of p.variants) stmts.push(env.DB.prepare("INSERT INTO product_variants(id,product_id,size_label,color_label,stock) VALUES(?,?,?,?,?)")
    .bind(v.id,id,v.size,v.color,v.stock));
  await env.DB.batch(stmts);
  return respond({ok:true,id},editing?200:201);
}
function mimeFromBytes(bytes) {
  if(bytes.length>=12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" &&
    String.fromCharCode(...bytes.slice(8,12))==="WEBP") return "image/webp";
  if(bytes.length>=8 && bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71) return "image/png";
  if(bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return "image/jpeg";
  return null;
}
async function uploadImage(request,env,productId) {
  if(!env.IMAGES) return respond({error:"image_store_not_configured"},503);
  const p=await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(productId).first();
  if(!p) return respond({error:"product_not_found"},404);
  const declaredSize=Number(request.headers.get("content-length"));
  if(declaredSize>650000) return respond({error:"image_too_large"},413);
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(bytes.byteLength>650000 || bytes.byteLength<100) return respond({error:"invalid_image_size"},413);
  const mime=mimeFromBytes(bytes);
  if(!mime || request.headers.get("content-type")?.split(";")[0]!==mime) return respond({error:"invalid_image_format"},400);
  const extension=mime==="image/png"?"png":mime==="image/jpeg"?"jpg":"webp";
  const key="p/"+productId+"/"+crypto.randomUUID()+"."+extension;
  const id=crypto.randomUUID();
  const currentCount=await env.DB.prepare("SELECT COUNT(*) AS n FROM product_images WHERE product_id=?").bind(productId).first();
  const position=Number(currentCount?.n ?? 0);
  if(position>=10) return respond({error:"image_limit"},409);
  await env.IMAGES.put(key,bytes,{metadata:{mime}});
  try {
    await env.DB.prepare("INSERT INTO product_images(id,product_id,object_key,alt_fa,position) VALUES(?,?,?,?,?)")
      .bind(id,productId,key,"",position).run();
  } catch(err) {
    await env.IMAGES.delete(key);
    throw err;
  }
  return respond({ok:true,id,url:"/media/"+key},201);
}
export async function serveMedia(request,env) {
  if(request.method!=="GET" && request.method!=="HEAD") return new Response("Method not allowed",{status:405});
  if(!env.IMAGES) return new Response("Not configured",{status:503});
  const key=new URL(request.url).pathname.slice("/media/".length);
  if(!/^p\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(webp|png|jpg)$/.test(key)) return new Response("Not found",{status:404});
  const result=await env.IMAGES.getWithMetadata(key,"arrayBuffer");
  if(!result.value) return new Response("Not found",{status:404});
  const type=result.metadata?.mime || "application/octet-stream";
  return new Response(request.method==="HEAD"?null:result.value,{
    headers:{"content-type":type,"cache-control":"public,max-age=86400,immutable","x-content-type-options":"nosniff"}
  });
}
export async function handleAdmin(request,env) {
  const path=new URL(request.url).pathname, method=request.method;
  if(!env.DB || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length<12 || !env.SESSION_SECRET || env.SESSION_SECRET.length<32)
    return respond({error:"admin_not_configured"},503);
  // Make login fail closed when the D1 rate-limit table has not been migrated.
  if(path==="/api/admin/login" && method==="POST") {
    if(!originAllowed(request)) return respond({error:"invalid_origin"},403);
    let body;
    try {body=await readJson(request);} catch {return respond({error:"invalid_request"},400);}
    const ipKey=await ownerIpKey(request,env.SESSION_SECRET);
    let state;
    try {state=await failedLogins(env,ipKey);} catch {return respond({error:"login_rate_limit_not_ready"},503);}
    if(state.blocked) return respond({error:"try_later"},429);
    const supplied=typeof body.password==="string" ? body.password.slice(0,512) : "";
    if(!supplied || !await secureEqual(supplied,env.ADMIN_PASSWORD)) {
      await recordFailure(env,ipKey);
      return respond({error:"invalid_login"},401);
    }
    await env.DB.prepare("DELETE FROM admin_login_attempts WHERE ip_hash=?").bind(ipKey).run();
    const token=await issueSession(env.SESSION_SECRET);
    return respond({ok:true},200, {"set-cookie":cookieString(token)});
  }
  const session=await readSession(request,env.SESSION_SECRET);
  if(!session) return respond({error:"authentication_required"},401);
  if(path==="/api/admin/me" && method==="GET") return respond({ok:true,csrf:session.csrf});
  if(path==="/api/admin/products" && method==="GET") {
    const offset=int(new URL(request.url).searchParams.get("offset")||"0",0,100000);
    return listProducts(env,offset===null?0:offset);
  }
  if(!requireCsrf(request,session)) return respond({error:"invalid_csrf"},403);
  if(path==="/api/admin/logout" && method==="POST")
    return respond({ok:true},200,{"set-cookie":cookieString("",0)});
  if(path==="/api/admin/products" && method==="POST") {
    try {return await insertProduct(env,await readJson(request));}
    catch(err) {return respond({error:["invalid_product","invalid_variants","invalid_variant","duplicate_variant","invalid_content_type","payload_too_large"].includes(err.message)?err.message:"failed_to_save"},400);}
  }
  const match=path.match(/^\/api\/admin\/products\/([a-f0-9-]{36})$/);
  if(match && method==="PUT") {
    try {return await insertProduct(env,await readJson(request),match[1]);}
    catch(err) {return respond({error:["invalid_product","invalid_variants","invalid_variant","duplicate_variant"].includes(err.message)?err.message:"failed_to_save"},400);}
  }
  if(match && method==="DELETE") {
    await env.DB.prepare("UPDATE products SET active=0,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(match[1]).run();
    return respond({ok:true});
  }
  const img=path.match(/^\/api\/admin\/products\/([a-f0-9-]{36})\/images$/);
  if(img && method==="POST") return uploadImage(request,env,img[1]);
  const deleteImage=path.match(/^\/api\/admin\/images\/([a-f0-9-]{36})$/);
  if(deleteImage && method==="DELETE") {
    const row=await env.DB.prepare("SELECT object_key FROM product_images WHERE id=?").bind(deleteImage[1]).first();
    if(!row) return respond({error:"not_found"},404);
    await env.DB.prepare("DELETE FROM product_images WHERE id=?").bind(deleteImage[1]).run();
    if(env.IMAGES) await env.IMAGES.delete(row.object_key);
    return respond({ok:true});
  }
  return respond({error:"not_found"},404);
}
