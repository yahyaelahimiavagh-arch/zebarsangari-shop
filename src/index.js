import {handleAdmin, serveMedia} from "./admin-api.js";
import {handlePublicCheckout} from "./checkout.js";
import {handleStudioPublic} from "./store-studio.js";
// Worker entry point: static storefront + read-only catalog API. No checkout/admin writes.
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: JSON_HEADERS});

const LEGACY_CATEGORIES=new Set(["women","men","kids","socks","accessories"]);
const SAFE_CATEGORY=/^(?:[a-z][a-z0-9_-]{1,40}|[a-f0-9-]{36})$/;
async function catalog(env, category){
  const selected=typeof category==="string"&&SAFE_CATEGORY.test(category)?category:null;
  let q,enhanced=true;
  try{
    const sql="SELECT p.id,p.slug,p.title_fa,p.description_fa,p.category,p.price_toman,p.compare_at_toman,p.created_at,"+
      "COALESCE(d.sort_order,1000) AS sort_order,COALESCE(d.featured,0) AS featured "+
      "FROM products p LEFT JOIN shop_product_display d ON d.product_id=p.id WHERE p.active=1 "+
      (selected?"AND (EXISTS(SELECT 1 FROM shop_product_categories m WHERE m.product_id=p.id AND m.category_id=?) OR (p.category=? AND NOT EXISTS(SELECT 1 FROM shop_product_categories m2 WHERE m2.product_id=p.id))) ":"")+
      "ORDER BY COALESCE(d.sort_order,1000),p.created_at DESC LIMIT 150";
    q=selected?await env.DB.prepare(sql).bind(selected,selected).all():await env.DB.prepare(sql).all();
  }catch(err){
    if(!String(err?.message||"").includes("no such table"))throw err;
    enhanced=false;
    const legacy=selected&&LEGACY_CATEGORIES.has(selected)?selected:null;
    const sql="SELECT id,slug,title_fa,description_fa,category,price_toman,compare_at_toman,created_at FROM products WHERE active=1 "+
      (legacy?"AND category=? ":"")+"ORDER BY created_at DESC LIMIT 150";
    q=legacy?await env.DB.prepare(sql).bind(legacy).all():await env.DB.prepare(sql).all();
  }
  const products=q.results||[];
  if(!products.length)return response({products:[],count:0});
  // D1 permits at most 100 SQL bound parameters per query. Query related
  // rows in bounded chunks rather than sending 101-150 product IDs at once.
  // This preserves the legacy 150-product response until cursor pagination lands.
  const ids=products.map(p=>p.id);
  const rows=[{results:[]},{results:[]},{results:[]}];
  const CATALOG_BIND_CHUNK=75; // headroom for any future additional bound arguments
  for(let start=0;start<ids.length;start+=CATALOG_BIND_CHUNK){
    const chunk=ids.slice(start,start+CATALOG_BIND_CHUNK);
    const slots=chunk.map(()=>"?").join(",");
    const queries=[
      env.DB.prepare("SELECT id,product_id,sku,size_label,color_label,stock FROM product_variants WHERE active=1 AND product_id IN ("+slots+") ORDER BY product_id,size_label,color_label").bind(...chunk).all(),
      env.DB.prepare("SELECT id,product_id,object_key,alt_fa,position FROM product_images WHERE product_id IN ("+slots+") ORDER BY product_id,position").bind(...chunk).all()
    ];
    if(enhanced)queries.push(env.DB.prepare("SELECT product_id,category_id FROM shop_product_categories WHERE product_id IN ("+slots+")").bind(...chunk).all());
    const results=await Promise.all(queries);
    for(let index=0;index<results.length;index++){
      rows[index].results.push(...(results[index].results||[]));
    }
  }
  const variants=new Map(ids.map(id=>[id,[]])),images=new Map(ids.map(id=>[id,[]])),cats=new Map(ids.map(id=>[id,[]]));
  for(const v of rows[0].results||[])variants.get(v.product_id)?.push({id:v.id,sku:v.sku,size:v.size_label,color:v.color_label,stock:v.stock});
  for(const im of rows[1].results||[])images.get(im.product_id)?.push({id:im.id,key:im.object_key,alt:im.alt_fa,position:im.position});
  if(enhanced)for(const c of rows[2].results||[])cats.get(c.product_id)?.push(c.category_id);
  return response({count:products.length,products:products.map(p=>({
    id:p.id,slug:p.slug,title:p.title_fa,description:p.description_fa,category:p.category,
    categoryIds:cats.get(p.id)?.length?cats.get(p.id):[p.category],
    sortOrder:p.sort_order??1000,featured:!!p.featured,
    priceToman:p.price_toman,compareAtToman:p.compare_at_toman,
    variants:variants.get(p.id),images:images.get(p.id)
  }))});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/media/")) return serveMedia(request,env);
    if (url.pathname === "/admin.html") return Response.redirect(new URL("/manage.html",request.url),302);
    if (url.pathname === "/manage.html" || url.pathname === "/studio.html") {
      const asset=await env.ASSETS.fetch(request);
      const headers=new Headers(asset.headers);
      headers.set("cache-control","no-store");
      headers.set("x-frame-options","DENY");
      headers.set("x-content-type-options","nosniff");
      headers.set("referrer-policy","no-referrer");
      headers.set('content-security-policy',"default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'");
      return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
    }
    if (url.pathname.startsWith("/api/admin/")) return handleAdmin(request,env);
    if (url.pathname === "/api/store-layout" && request.method==="GET") return handleStudioPublic(request,env);
    if (url.pathname === "/api/shop-settings" || url.pathname === "/api/orders" || /^\/api\/orders\/[a-f0-9-]{36}\/receipt$/.test(url.pathname)) return handlePublicCheckout(request,env);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    if (request.method !== "GET") {
      return response({error: "method_not_allowed"}, 405);
    }
    if (url.pathname === "/api/health") {
      return response({ok: true, catalogConfigured: Boolean(env.DB)});
    }
    if (url.pathname !== "/api/products") {
      return response({error: "not_found"}, 404);
    }
    if (!env.DB) {
      return response({error: "catalog_not_configured"}, 503);
    }
    try {
      return await catalog(env, url.searchParams.get("category"));
    } catch (error) {
      console.error("D1 catalog query failed:", error?.message);
      return response({error: "catalog_unavailable"}, 503);
    }
  }
};
