// Zero-dependency catalog regression test. Run: node --test tests/catalog.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../src/index.js",import.meta.url),"utf8")
 .replace(/^import .*?;\s*$/gm,"").replace("export default {","return {");
// Tests public Worker API through an in-memory D1-shaped fake.
// No production credentials, network access, or real customer data.
const worker=new Function(source)();

function dbFor(count,{legacy=false}={}){
 const products=Array.from({length:count},(_,i)=>({
  id:"product-"+i,slug:"item-"+i,title_fa:"کالای "+i,description_fa:"توضیح",
  category:"women",price_toman:1000+i,compare_at_toman:null,created_at:"2026-11-01",
  sort_order:1000,featured:0
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
     if(sql.includes("FROM products p LEFT JOIN")){
      if(legacy)throw Error("no such table: shop_product_display");
      return {results:products.slice(0,150)};
     }
     if(sql.includes("FROM products WHERE active=1"))return {results:products.slice(0,150)};
     if(sql.includes("FROM product_variants"))return {results:args.map(id=>({
      id:"variant-"+id,product_id:id,sku:null,size_label:"M",color_label:"مشکی",stock:2
     }))};
     if(sql.includes("FROM product_images"))return {results:args.map(id=>({
      id:"image-"+id,product_id:id,object_key:"p/"+id+"/a.webp",alt_fa:"",position:0
     }))};
     if(sql.includes("FROM shop_product_categories"))return {results:args.map(id=>({product_id:id,category_id:"women"}))};
     throw Error("Unexpected SQL: "+sql);
    }
   };
   return stmt;
  }
 };
 return {DB,boundCounts};
}
async function getCatalog(n,legacy=false){
 const env=dbFor(n,{legacy});
 const result=await worker.fetch(new Request("https://shop.example/api/products"),{DB:env.DB});
 assert.equal(result.status,200);
 return {data:await result.json(),binds:env.boundCounts};
}
for(const n of [0,75,100,101,150,160]){
 test("catalog returns complete bounded data for "+n+" active products",async()=>{
  const {data,binds}=await getCatalog(n);
  const expected=Math.min(n,150);
  assert.equal(data.count,expected);
  assert.equal(data.products.length,expected);
  assert.ok(binds.every(x=>x<=100),"No D1 statement may exceed 100 bound parameters");
  for(const p of data.products){
   assert.equal(p.variants.length,1);
   assert.equal(p.images.length,1);
   assert.deepEqual(p.categoryIds,["women"]);
  }
  if(n>75)assert.ok(binds.includes(75),"chunking should be active");
 });
}
test("legacy catalog fallback also works beyond 100 items",async()=>{
 const {data,binds}=await getCatalog(150,true);
 assert.equal(data.products.length,150);
 assert.ok(binds.every(x=>x<=100));
 assert.equal(data.products[100].categoryIds[0],"women");
});
