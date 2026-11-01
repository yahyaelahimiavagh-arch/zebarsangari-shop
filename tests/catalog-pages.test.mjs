// Validate the browser loader without DOM, servers or production data.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const window={};
runInNewContext(readFileSync(new URL("../site/catalog-pages.js",import.meta.url),"utf8"),{window});
const {load}=window.ZebarCatalogPages;
const row=id=>({id});

test("storefront collects all catalog pages",async()=>{
 const requests=[];
 const products=await load(async cursor=>{
  requests.push(cursor);
  return cursor===null?{products:[row("a"),row("b")],nextCursor:"next"}:
   {products:[row("c")],nextCursor:null};
 });
 assert.deepEqual(products.map(p=>p.id),["a","b","c"]);
 assert.deepEqual(requests,[null,"next"]);
});
test("checkout stops after all cart product ids are resolved",async()=>{
 let calls=0;
 const products=await load(async cursor=>{
  calls++;
  return cursor===null?{products:[row("a"),row("b")],nextCursor:"next"}:
   {products:[row("c")],nextCursor:null};
 },["b"]);
 assert.equal(calls,1);
 assert.deepEqual(products.map(p=>p.id),["a","b"]);
});
test("checkout continues when a cart id is on a later page",async()=>{
 let calls=0;
 const products=await load(async cursor=>{
  calls++;
  return cursor===null?{products:[row("a")],nextCursor:"next"}:
   {products:[row("b")],nextCursor:null};
 },["b"]);
 assert.equal(calls,2);
 assert.deepEqual(products.map(p=>p.id),["a","b"]);
});
test("loader rejects repeated products and cyclical cursors",async()=>{
 await assert.rejects(()=>load(async cursor=>cursor===null?
  {products:[row("a")],nextCursor:"one"}:
  {products:[row("a")],nextCursor:"two"}),/duplicate_catalog_item/);
 await assert.rejects(()=>load(async cursor=>cursor===null?
  {products:[row("a")],nextCursor:"one"}:
  {products:[row("b")],nextCursor:"one"}),/invalid_catalog_cursor/);
});
test("legacy first-page response without nextCursor is supported",async()=>{
 const products=await load(async()=>({products:[row("a")]}));
 assert.equal(products.length,1);
});
