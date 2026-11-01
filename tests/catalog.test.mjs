// Zero-dependency tests for catalog pagination, legacy fallback and D1 bind limits.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../src/index.js",import.meta.url),"utf8")
 .replace(/^import .*?;\s*$/gm,"").replace("export default {","return {");
const worker=new Function(source)();

function dbFor(count,{legacy=false}={}){
 const products=Array.from({length:count},(_,i)=>({
  id:"product-"+String(i).padStart(5,"0"),slug:"item-"+i,title_fa:"کالای "+i,
  description_fa:"توضیح",category:i%3===0?"men":"women",
  price_toman:1000+i,compare_at_toman:null,
  created_at:"2026-11-"+String(1+i%10).padStart(2,"0"),
  sort_order:(i%4)*10,featured:0
 }));
 const boundCounts=[];
 const DB={
  prepare(sql){
   let args=[];
   const stmt={
    bind(...values){args=values;return stmt;},
    async all(){
     boundCounts.push(args.length);
     if(args.length>100)throw Error("D1 TOO_MANY_BOUND_PARAMETERS");
     if(sql.includes("FROM products p LEFT JOIN")||sql.includes("FROM products WHERE active=1")){
      const enhanced=sql.includes("FROM products p LEFT JOIN");
      if(enhanced&&legacy)throw Error("no such table: shop_product_display");
      let rows=[...products];
      const selected=enhanced?sql.includes("m.category_id=?"):sql.includes("AND category=?");
      if(selected)rows=rows.filter(p=>p.category===args[0]);
      if(enhanced){
       rows.sort((a,b)=>a.sort_order-b.sort_order||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
       if(sql.includes("COALESCE(d.sort_order,1000)>?")){
        const [rank,rank2,date,rank3,date2,id]=args.slice(-6);
        assert.equal(rank,rank2);assert.equal(rank,rank3);assert.equal(date,date2);
        rows=rows.filter(p=>p.sort_order>rank||(p.sort_order===rank&&
         (p.created_at<date||(p.created_at===date&&p.id<id))));
       }
      }else{
       rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
       if(sql.includes("created_at<?")){
        const [date,date2,id]=args.slice(-3);
        assert.equal(date,date2);
        rows=rows.filter(p=>p.created_at<date||(p.created_at===date&&p.id<id));
       }
      }
      return {results:rows.slice(0,151)};
     }
     if(sql.includes("FROM product_variants"))return {results:args.map(id=>({
      id:"variant-"+id,product_id:id,sku:null,size_label:"M",color_label:"مشکی",stock:2
     }))};
     if(sql.includes("FROM product_images"))return {results:args.map(id=>({
      id:"image-"+id,product_id:id,object_key:"p/"+id+"/a.webp",alt_fa:"",position:0
     }))};
     if(sql.includes("FROM shop_product_categories"))return {results:args.map(id=>({
      product_id:id,category_id:"women"
     }))};
     throw Error("Unexpected SQL: "+sql);
    }
   };
   return stmt;
  }
 };
 return {DB,boundCounts,products};
}
async function page(env,cursor=null,category=null){
 const url=new URL("https://shop.example/api/products");
 if(cursor!==null)url.searchParams.set("cursor",cursor);
 if(category!==null)url.searchParams.set("category",category);
 const res=await worker.fetch(new Request(url),{DB:env.DB});
 return {status:res.status,data:await res.json()};
}
for(const n of [0,75,100,101,150,160]){
 test("first catalog page has a stable 150-item bound for "+n,async()=>{
  const env=dbFor(n),{status,data}=await page(env);
  assert.equal(status,200);
  assert.equal(data.count,Math.min(n,150));
  assert.equal(data.products.length,Math.min(n,150));
  assert.equal(typeof data.nextCursor,n>150?"string":"object");
  assert.ok(env.boundCounts.every(x=>x<=100),"D1 bind count must stay <= 100");
  for(const p of data.products){
   assert.equal(p.variants.length,1);
   assert.equal(p.images.length,1);
   assert.deepEqual(p.categoryIds,["women"]);
  }
  if(n>75)assert.ok(env.boundCounts.includes(75),"D1 chunking must be active");
 });
}
for(const legacy of [false,true]){
 test((legacy?"legacy":"enhanced")+" D1 pagination returns all 351 products exactly once",async()=>{
  const env=dbFor(351,{legacy}),seen=new Set();
  let cursor=null;
  for(let i=0;i<5;i++){
   const {status,data}=await page(env,cursor);
   assert.equal(status,200);
   for(const p of data.products){
    assert.ok(!seen.has(p.id),"duplicate product "+p.id);
    seen.add(p.id);
   }
   if(!data.nextCursor){assert.equal(seen.size,351);break;}
   cursor=data.nextCursor;
  }
  assert.equal(seen.size,351);
  assert.ok(env.boundCounts.every(n=>n<=100));
 });
 test((legacy?"legacy":"enhanced")+" category pages keep their filter",async()=>{
  const env=dbFor(450,{legacy}),seen=new Set();
  let cursor=null;
  for(let i=0;i<5;i++){
   const {data}=await page(env,cursor,"men");
   for(const p of data.products){assert.equal(p.category,"men");seen.add(p.id);}
   if(!data.nextCursor)break;
   cursor=data.nextCursor;
  }
  assert.equal(seen.size,150);
 });
}
test("new earlier products do not duplicate old pages",async()=>{
 const env=dbFor(301);
 const first=(await page(env)).data;
 env.products.push({
  id:"product-99999",slug:"late",title_fa:"جدید",description_fa:"",
  category:"women",price_toman:1000,compare_at_toman:null,created_at:"2026-11-30",
  sort_order:-100,featured:0
 });
 const second=(await page(env,first.nextCursor)).data;
 const firstIds=new Set(first.products.map(p=>p.id));
 assert.ok(second.products.every(p=>!firstIds.has(p.id)));
 assert.ok(second.products.every(p=>p.id!=="product-99999"));
});
test("malformed cursors are rejected, not treated as first pages",async()=>{
 const env=dbFor(250);
 for(const cursor of ["%%%","not-base64","a".repeat(513),btoa(JSON.stringify(["wrong","2026-11-01","x"]))]){
  const {status,data}=await page(env,cursor);
  assert.equal(status,400);
  assert.equal(data.error,"invalid_cursor");
 }
});
