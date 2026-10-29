// Manual checkout for Zebar Sangari. No gateway / automated payment confirmation.
// Receipts are sent by customers through messaging apps, never uploaded to this Worker.
const H={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{...H,...headers}});
const norm=x=>String(x??"").replace(/[۰-۹]/g,c=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g,c=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
const str=(x,n)=>typeof x==="string"?x.trim().slice(0,n):"";
const integer=(x,min,max)=>Number.isSafeInteger(Number(x))&&Number(x)>=min&&Number(x)<=max?Number(x):null;
const card=x=>norm(x).replace(/[ -]/g,"");
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
async function hash(x){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(x)));}
function sameOrigin(req){
 const u=new URL(req.url);
 return req.headers.get("origin")===u.origin && req.headers.get("sec-fetch-site")!=="cross-site";
}
async function bodyJson(req,max=12000){
 if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw Error("invalid_json");
 const body=await req.text();
 if(body.length>max)throw Error("payload_too_large");
 return JSON.parse(body);
}
const settingsOf = async db => {
 const main=await db.prepare("SELECT whatsapp,telegram,phone,card_number,card_holder,orders_enabled FROM shop_settings WHERE id=1").first();
 let bale={};
 try{bale=await db.prepare("SELECT bale_phone,bale_username FROM shop_bale_settings WHERE id=1").first()||{};}
 catch(error){if(!String(error?.message||error).includes("no such table"))throw error;}
 return {...main,...bale};
};
const publicSettings=s=>({
 whatsapp:s?.whatsapp||"",telegram:s?.telegram||"",phone:s?.phone||"",
 cardNumber:s?.card_number||"",cardHolder:s?.card_holder||"",balePhone:s?.bale_phone||"",baleUsername:s?.bale_username||"",
 ordersEnabled:Boolean(s?.orders_enabled)
});
function validateSettings(data){
 const whatsapp=norm(str(data.whatsapp,20)).replace(/[^\d+]/g,"");
 const phone=norm(str(data.phone,20)).replace(/[^\d+]/g,"");
 const telegram=str(data.telegram,32).replace(/^@/,"");
 const cardNumber=card(data.cardNumber||"");
 const cardHolder=str(data.cardHolder,100);
 const balePhone=norm(str(data.balePhone,20)).replace(/[^\d+]/g,"");
 const baleUsername=str(data.baleUsername,32).replace(/^@/,"");
 if(balePhone && !/^\+?\d{10,15}$/.test(balePhone))throw Error("invalid_bale_phone");
 if(baleUsername && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(baleUsername))throw Error("invalid_bale_username");
 if(whatsapp && !/^[1-9]\d{7,14}$/.test(whatsapp))throw Error("whatsapp_international_digits_required");
 if(phone && !/^\+?\d{7,15}$/.test(phone))throw Error("invalid_phone");
 if(telegram && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram))throw Error("invalid_telegram_username");
 if(cardNumber && !/^\d{16}$/.test(cardNumber))throw Error("invalid_card_number");
 if(cardNumber){
  let sum=0;
  for(let i=0;i<16;i++){
   const digit=Number(cardNumber[i]),m=i%2===0?digit*2:digit;
   sum+=m>9?m-9:m;
  }
  if(sum%10!==0)throw Error("card_checksum_invalid");
 }
 if(Boolean(cardNumber)!==Boolean(cardHolder))throw Error("card_and_owner_required");
 const enabled=data.ordersEnabled===true;
 if(enabled && !(whatsapp||telegram||cardNumber))throw Error("configure_contact_first");
 return {whatsapp,telegram,phone,cardNumber,cardHolder,balePhone,baleUsername,enabled};
}
async function orderRate(env,req){
 const ip=req.headers.get("CF-Connecting-IP")||"unknown";
 const ipHash=await hash(env.SESSION_SECRET+"|order-rate|"+ip);
 const now=Date.now();
 // One atomic statement, limiting a single IP to 4 new orders per rolling 60-minute window.
 const row=await env.DB.prepare(
  "INSERT INTO manual_order_rate(ip_hash,window_start_ms,count) VALUES(?,?,1) "+
  "ON CONFLICT(ip_hash) DO UPDATE SET "+
  "count=CASE WHEN excluded.window_start_ms-manual_order_rate.window_start_ms>=3600000 THEN 1 ELSE manual_order_rate.count+1 END,"+
  "window_start_ms=CASE WHEN excluded.window_start_ms-manual_order_rate.window_start_ms>=3600000 THEN excluded.window_start_ms ELSE manual_order_rate.window_start_ms END "+
  "RETURNING count").bind(ipHash,now).first();
 return {allowed:Number(row?.count)<=4,ipHash};
}
function randomToken(){
 const b=crypto.getRandomValues(new Uint8Array(32));
 return Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
}
function validationInput(body){
 if(!body||typeof body!=="object")throw Error("invalid_order");
 const buyer=str(body.buyerName,90),phone=norm(str(body.buyerPhone,20)).replace(/[^\d+]/g,"");
 const city=str(body.city,90),address=str(body.address,350);
 const channel=body.channel;
 if(buyer.length<3||!/^(\+98|0)?9\d{9}$/.test(phone)||!city||address.length<8)
  throw Error("customer_details_required");
 if(!["whatsapp","telegram","card"].includes(channel))throw Error("invalid_channel");
 if(!Array.isArray(body.items)||!body.items.length||body.items.length>12)throw Error("invalid_items");
 const seen=new Set(),items=[];
 for(const line of body.items){
  if(!line||typeof line!=="object")throw Error("invalid_items");
  const productId=str(line.productId,80),variantId=str(line.variantId,80),quantity=integer(line.quantity,1,20);
  if(!/^[a-f\d-]{36}$/.test(productId)||!/^[a-f\d-]{36}$/.test(variantId)||quantity===null)throw Error("invalid_items");
  if(seen.has(variantId))throw Error("duplicate_variant");
  seen.add(variantId);items.push({productId,variantId,quantity});
 }
 return {buyer,phone,city,address,channel,items};
}
async function createOrder(request,env){
 if(!env.DB||!env.SESSION_SECRET) return json({error:"not_configured"},503);
 if(!sameOrigin(request)) return json({error:"invalid_origin"},403);
 const settings=await settingsOf(env.DB);
 if(!settings?.orders_enabled) return json({error:"orders_disabled"},503);
 let input;
 try{input=validationInput(await bodyJson(request));}
 catch(e){return json({error:e.message||"invalid_order"},400);}
 if(input.channel==="whatsapp"&&!settings.whatsapp || input.channel==="telegram"&&!settings.telegram ||
 input.channel==="card"&&!settings.card_number)return json({error:"channel_not_available"},400);
 const rate=await orderRate(env,request);
 if(!rate.allowed) return json({error:"too_many_orders"},429,{"retry-after":"3600"});
 const ids=input.items.map(v=>v.variantId);
 const placeholders=ids.map(()=>"?").join(",");
 const dbRows=await env.DB.prepare(
  "SELECT v.id AS variant_id,v.product_id,v.size_label,v.color_label,v.stock,p.title_fa,p.price_toman "+
  "FROM product_variants v JOIN products p ON p.id=v.product_id "+
  "WHERE p.active=1 AND v.active=1 AND v.id IN ("+placeholders+")"
 ).bind(...ids).all();
 const byId=new Map((dbRows.results||[]).map(x=>[x.variant_id,x]));
 const lines=[];let subtotal=0;
 for(const line of input.items){
  const row=byId.get(line.variantId);
  if(!row||row.product_id!==line.productId || row.stock<line.quantity)return json({error:"stock_or_product_changed"},409);
  const unit=Number(row.price_toman),total=unit*line.quantity;
  if(!Number.isSafeInteger(total)||total<0)return json({error:"invalid_total"},400);
  subtotal+=total;
  if(!Number.isSafeInteger(subtotal)||subtotal>100000000000)return json({error:"invalid_total"},400);
  lines.push({row,qty:line.quantity,total,unit});
 }
 const orderId=crypto.randomUUID(),code="ZS-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+orderId.slice(0,8).toUpperCase();
 // Legacy schema still requires a token hash; no upload token is provided to customers.
 const tokenHash=await hash(randomToken());
 const stmts=[env.DB.prepare(
  "INSERT INTO manual_orders(id,code,buyer_name,buyer_phone,city,delivery_address,contact_channel,status,subtotal_toman,upload_token_hash,ip_hash) "+
  "VALUES(?,?,?,?,?,?,?,'pending',?,?,?)"
 ).bind(orderId,code,input.buyer,input.phone,input.city,input.address,input.channel,subtotal,tokenHash,rate.ipHash)];
 for(const line of lines){
  stmts.push(env.DB.prepare(
   "INSERT INTO manual_order_lines(id,order_id,product_id,variant_id,product_title,size_label,color_label,quantity,unit_price_toman,line_total_toman) VALUES(?,?,?,?,?,?,?,?,?,?)"
  ).bind(crypto.randomUUID(),orderId,line.row.product_id,line.row.variant_id,line.row.title_fa,line.row.size_label,line.row.color_label,line.qty,line.unit,line.total));
 }
 await env.DB.batch(stmts);
 return json({ok:true,code,orderId,subtotalToman:subtotal,status:"pending",manualReview:true,
  note:"سفارش فقط درخواست ثبت شده است؛ پرداخت و موجودی تا تایید فروشنده قطعی نیست."},201);
}
export async function handlePublicCheckout(request,env){
 const url=new URL(request.url),path=url.pathname;
 try {
  if(path==="/api/shop-settings" && request.method==="GET"){
   if(!env.DB)return json({error:"not_configured"},503);
   return json(publicSettings(await settingsOf(env.DB)));
  }
  if(path==="/api/orders" && request.method==="POST")return await createOrder(request,env);
  if(/^\/api\/orders\/[a-f0-9-]{36}\/receipt$/.test(path))return json({error:"receipt_upload_disabled"},410);
  return json({error:"not_found"},404);
 }catch(e){
  console.error("Checkout exception",e?.message);
  return json({error:"order_service_unavailable"},503);
 }
}
function adminSettings(data){
 return {whatsapp:data?.whatsapp||"",telegram:data?.telegram||"",phone:data?.phone||"",
 cardNumber:data?.card_number||"",cardHolder:data?.card_holder||"",balePhone:data?.bale_phone||"",baleUsername:data?.bale_username||"",ordersEnabled:Boolean(data?.orders_enabled)};
}
async function adminOrders(request,env){
 const u=new URL(request.url),path=u.pathname,method=request.method;
 if(path==="/api/admin/shop-settings" && method==="GET")
  return json(adminSettings(await settingsOf(env.DB)));
 if(path==="/api/admin/shop-settings" && method==="PUT"){
  let input,p;
  try{input=await bodyJson(request);p=validateSettings(input);}catch(e){return json({error:e.message||"invalid_settings"},400);}
  await env.DB.prepare(
   "UPDATE shop_settings SET whatsapp=?,telegram=?,phone=?,card_number=?,card_holder=?,orders_enabled=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1"
  ).bind(p.whatsapp,p.telegram,p.phone,p.cardNumber,p.cardHolder,p.enabled?1:0).run();
  try{
   await env.DB.prepare("INSERT INTO shop_bale_settings(id,bale_phone,bale_username) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET bale_phone=excluded.bale_phone,bale_username=excluded.bale_username,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(p.balePhone,p.baleUsername).run();
  }catch(error){
   if(!String(error?.message||error).includes("no such table"))throw error;
   if(p.balePhone||p.baleUsername)return json({error:"bale_settings_migration_required"},503);
  }
  return json({ok:true});
 }
 if(path==="/api/admin/orders" && method==="GET"){
  const rows=await env.DB.prepare("SELECT id,code,buyer_name,buyer_phone,city,delivery_address,contact_channel,status,subtotal_toman,created_at FROM manual_orders ORDER BY created_at DESC LIMIT 80").all();
  return json({orders:rows.results||[]});
 }
 const m=path.match(/^\/api\/admin\/orders\/([a-f0-9-]{36})(?:\/(status))?$/);
 if(!m)return json({error:"not_found"},404);
 const id=m[1],sub=m[2]||"";
 if(sub==="status" && method==="PATCH"){
  let body;try{body=await bodyJson(request);}catch{return json({error:"invalid_json"},400);}
  const status=body?.status;
  if(!["pending","receipt_submitted","confirmed","shipped","cancelled"].includes(status))return json({error:"invalid_status"},400);
  const row=await env.DB.prepare("SELECT status FROM manual_orders WHERE id=?").bind(id).first();
  if(!row)return json({error:"not_found"},404);
  if(row.status==="cancelled" && status!=="cancelled")return json({error:"cancelled_order_locked"},409);
  if(status==="shipped" && row.status!=="confirmed" && row.status!=="shipped")return json({error:"confirm_first"},409);
  await env.DB.prepare("UPDATE manual_orders SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(status,id).run();
  return json({ok:true,status});
 }
 if(!sub && method==="GET"){
  const order=await env.DB.prepare("SELECT id,code,buyer_name,buyer_phone,city,delivery_address,contact_channel,status,subtotal_toman,created_at FROM manual_orders WHERE id=?").bind(id).first();
  if(!order)return json({error:"not_found"},404);
  const lines=await env.DB.prepare("SELECT product_title,size_label,color_label,quantity,unit_price_toman,line_total_toman FROM manual_order_lines WHERE order_id=?").bind(id).all();
  return json({order,lines:lines.results||[]});
 }
 return json({error:"not_found"},404);
}
export async function handleAdminCheckout(request,env){
 try{return await adminOrders(request,env)}
 catch(e){console.error("Admin checkout exception",e?.message);return json({error:"admin_checkout_unavailable"},503)}
}