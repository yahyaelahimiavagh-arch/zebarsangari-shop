// Store Studio v1 — category tree, multi-category products, merchandising and section order.
// Called only after shared admin session validation by admin-api.js.
const H={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const out=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:H});
const uuid=/^[a-f0-9-]{36}$/i;
const safeId=v=>typeof v==="string"&&(/^[a-z][a-z0-9_-]{1,40}$/.test(v)||uuid.test(v));
const integer=(v,low,high)=>Number.isSafeInteger(v)&&v>=low&&v<=high;
const name=v=>typeof v==="string"&&v.trim().length>=2&&v.trim().length<=64?v.trim():null;
const bool=v=>v===true||v===false;
async function dataJSON(request){
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))throw Error("invalid_json");
 const text=await request.text();if(text.length>32000)throw Error("payload_too_large");
 return JSON.parse(text);
}
async function allCategories(db){
 const r=await db.prepare("SELECT id,name_fa AS name,parent_id AS parentId,sort_order AS sortOrder,visible FROM shop_categories ORDER BY COALESCE(parent_id,''),sort_order,id").all();
 return (r.results||[]).map(x=>({...x,visible:Boolean(x.visible)}));
}
const findCat=(cats,id)=>cats.find(c=>c.id===id);
function validateParent(cats,id,parentId){
 if(parentId===null)return;
 if(!safeId(parentId)||!findCat(cats,parentId))throw Error("invalid_parent");
 let current=parentId,depth=0,seen=new Set([id]);
 while(current){
  if(seen.has(current))throw Error("category_cycle");
  seen.add(current);depth++;
  if(depth>4)throw Error("category_too_deep");
  current=findCat(cats,current)?.parentId||null;
 }
}
async function listProducts(db){
 const rows=await db.prepare(
  "SELECT p.id,p.title_fa AS title,p.category,p.active,p.price_toman AS priceToman,"+
  "COALESCE(d.sort_order,1000) AS sortOrder,COALESCE(d.featured,0) AS featured "+
  "FROM products p LEFT JOIN shop_product_display d ON d.product_id=p.id ORDER BY COALESCE(d.sort_order,1000),p.created_at DESC LIMIT 300"
 ).all();
 const categoryRows=await db.prepare("SELECT product_id,category_id FROM shop_product_categories ORDER BY category_id").all();
 const grouping=new Map();
 for(const link of categoryRows.results||[]){if(!grouping.has(link.product_id))grouping.set(link.product_id,[]);grouping.get(link.product_id).push(link.category_id);}
 return (rows.results||[]).map(row=>({...row,active:Boolean(row.active),featured:Boolean(row.featured),categoryIds:grouping.get(row.id)||[row.category]}));
}
async function layout(db){
 const rows=await db.prepare("SELECT id,name_fa AS name,sort_order AS sortOrder,visible FROM shop_home_sections ORDER BY sort_order,id").all();
 return (rows.results||[]).map(x=>({...x,visible:Boolean(x.visible)}));
}
function cleanError(err){
 const allowed=["invalid_json","payload_too_large","invalid_name","invalid_parent","category_cycle","category_too_deep","not_found","category_in_use","protected_category","invalid_order","invalid_product","invalid_categories","invalid_featured","invalid_visibility","migration_required"];
 if(String(err?.message||"").includes("no such table")||String(err?.message||"").includes("no such column"))return out({error:"migration_required"},503);
 if(allowed.includes(err?.message))return out({error:err.message},400);
 console.error("Store Studio:",err?.message);return out({error:"studio_unavailable"},503);
}
async function work(req,env){
 const path=new URL(req.url).pathname,method=req.method,db=env.DB;
 if(path==="/api/admin/studio/categories"&&method==="GET")return out({categories:await allCategories(db)});
 if(path==="/api/admin/studio/categories"&&method==="POST"){
  const d=await dataJSON(req),n=name(d?.name),parent=d?.parentId??null;
  if(!n)throw Error("invalid_name");
  const cats=await allCategories(db);if(cats.length>=150)throw Error("invalid_order");
  validateParent(cats,"new",parent);
  const order=Math.max(0,...cats.filter(c=>c.parentId===parent).map(c=>c.sortOrder))+10;
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO shop_categories(id,name_fa,parent_id,sort_order) VALUES(?,?,?,?)").bind(id,n,parent,order).run();
  return out({ok:true,id},201);
 }
 const match=path.match(/^\/api\/admin\/studio\/categories\/([^/]+)$/);
 if(match && safeId(match[1])&&method==="PATCH"){
  const id=match[1],cats=await allCategories(db),current=findCat(cats,id);
  if(!current)return out({error:"not_found"},404);
  const d=await dataJSON(req),n=name(d?.name);
  if(!n||!bool(d?.visible))throw Error("invalid_name");
  const parent=d.parentId??null;validateParent(cats,id,parent);
  const moving=current.parentId!==parent;
  const order=moving?Math.max(0,...cats.filter(c=>c.parentId===parent).map(c=>c.sortOrder))+10:current.sortOrder;
  await db.prepare("UPDATE shop_categories SET name_fa=?,parent_id=?,visible=?,sort_order=? WHERE id=?")
   .bind(n,parent,d.visible?1:0,order,id).run();
  return out({ok:true});
 }
 if(match && safeId(match[1])&&method==="DELETE"){
  const id=match[1];
  if(["women","men","kids","socks","accessories"].includes(id))throw Error("protected_category");
  const c=await db.prepare("SELECT id FROM shop_categories WHERE id=?").bind(id).first();
  if(!c)return out({error:"not_found"},404);
  const child=await db.prepare("SELECT COUNT(*) AS n FROM shop_categories WHERE parent_id=?").bind(id).first();
  const linked=await db.prepare("SELECT COUNT(*) AS n FROM shop_product_categories WHERE category_id=?").bind(id).first();
  if(child.n||linked.n) return out({error:"category_in_use"},409);
  await db.prepare("DELETE FROM shop_categories WHERE id=?").bind(id).run();
  return out({ok:true});
 }
 if(path==="/api/admin/studio/categories/order"&&method==="PUT"){
  const d=await dataJSON(req),ids=d?.ids,cats=await allCategories(db);
  if(!Array.isArray(ids)||ids.length!==cats.length||new Set(ids).size!==ids.length||ids.some(id=>!findCat(cats,id)))throw Error("invalid_order");
  const byGroup=new Map(),stmts=[];
  for(const id of ids){const parent=findCat(cats,id).parentId||"root";const next=(byGroup.get(parent)||0)+1;byGroup.set(parent,next);
   stmts.push(db.prepare("UPDATE shop_categories SET sort_order=? WHERE id=?").bind(next*10,id));
  }
  if(stmts.length)await db.batch(stmts);return out({ok:true});
 }
 if(path==="/api/admin/studio/products"&&method==="GET")return out({products:await listProducts(db)});
 const pMatch=path.match(/^\/api\/admin\/studio\/products\/([a-f0-9-]{36})$/);
 if(pMatch&&method==="PATCH"){
  const id=pMatch[1],d=await dataJSON(req),cats=await allCategories(db);
  const exists=await db.prepare("SELECT id,category FROM products WHERE id=?").bind(id).first();
  if(!exists)return out({error:"not_found"},404);
  const ids=d?.categoryIds;
  if(!Array.isArray(ids)||ids.length<1||ids.length>12||new Set(ids).size!==ids.length||ids.some(k=>!findCat(cats,k)))throw Error("invalid_categories");
  if(!bool(d.featured))throw Error("invalid_featured");
  const position=d.sortOrder;
  if(!integer(position,0,100000))throw Error("invalid_order");
  const stmts=[
   db.prepare("INSERT INTO shop_product_display(product_id,sort_order,featured) VALUES(?,?,?) ON CONFLICT(product_id) DO UPDATE SET sort_order=excluded.sort_order,featured=excluded.featured").bind(id,position,d.featured?1:0),
   db.prepare("DELETE FROM shop_product_categories WHERE product_id=?").bind(id)
  ];
  for(const cat of ids)stmts.push(db.prepare("INSERT INTO shop_product_categories(product_id,category_id) VALUES(?,?)").bind(id,cat));
  await db.batch(stmts);return out({ok:true});
 }
 if(path==="/api/admin/studio/products/order"&&method==="PUT"){
  const d=await dataJSON(req),ids=d?.ids;
  if(!Array.isArray(ids)||ids.length>300||new Set(ids).size!==ids.length||ids.some(id=>!uuid.test(id)))throw Error("invalid_order");
  const rows=await db.prepare("SELECT id FROM products ORDER BY created_at DESC LIMIT 301").all();
  const all=(rows.results||[]).map(r=>r.id);
  if(all.length!==ids.length||all.some(id=>!ids.includes(id)))throw Error("invalid_order");
  if(ids.length)await db.batch(ids.map((id,i)=>db.prepare(
   "INSERT INTO shop_product_display(product_id,sort_order,featured) VALUES(?,?,0) ON CONFLICT(product_id) DO UPDATE SET sort_order=excluded.sort_order"
  ).bind(id,(i+1)*10)));
  return out({ok:true});
 }
 if(path==="/api/admin/studio/layout"&&method==="GET")return out({sections:await layout(db)});
 if(path==="/api/admin/studio/layout"&&method==="PUT"){
  const d=await dataJSON(req),input=d?.sections,old=await layout(db);
  if(!Array.isArray(input)||input.length!==old.length||new Set(input.map(x=>x.id)).size!==input.length||input.some(x=>!old.find(y=>y.id===x.id)||!bool(x.visible)))throw Error("invalid_order");
  await db.batch(input.map((x,i)=>db.prepare("UPDATE shop_home_sections SET visible=?,sort_order=? WHERE id=?").bind(x.visible?1:0,(i+1)*10,x.id)));
  return out({ok:true});
 }
 return out({error:"not_found"},404);
}
export async function handleStudioAdmin(req,env){
 try{return await work(req,env);}catch(error){return cleanError(error);}
}
export async function handleStudioPublic(req,env){
 try{
  if(!env.DB)return out({error:"not_configured"},503);
  const [cats,sections]=await Promise.all([allCategories(env.DB),layout(env.DB)]);
  return out({categories:cats.filter(c=>c.visible),sections});
 }catch(error){
  if(String(error?.message||"").includes("no such table"))return out({categories:[
   {id:"women",name:"زنانه",parentId:null,sortOrder:10,visible:true},
   {id:"men",name:"مردانه",parentId:null,sortOrder:20,visible:true},
   {id:"kids",name:"بچگانه",parentId:null,sortOrder:30,visible:true},
   {id:"socks",name:"جوراب",parentId:null,sortOrder:40,visible:true},
   {id:"accessories",name:"اکسسوری",parentId:null,sortOrder:50,visible:true}
  ],sections:[],migrationPending:true});
  console.error("Studio public layout:",error?.message);return out({error:"layout_unavailable"},503);
 }
}