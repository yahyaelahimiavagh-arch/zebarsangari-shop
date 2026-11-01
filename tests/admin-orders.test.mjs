import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const raw=readFileSync(new URL("../src/checkout.js",import.meta.url),"utf8")
 .replaceAll("export async function ","async function ");
const {handleAdminCheckout}=new Function(raw+";return {handleAdminCheckout}")();

function makeOrders(count=130){
 return Array.from({length:count},(_,i)=>({
  id:i.toString(16).padStart(8,"0")+"-0000-4000-8000-000000000000",
  code:"ZS-20261101-"+i.toString(16).padStart(8,"0").toUpperCase(),
  buyer_name:i%2?"علی نمونه":"فاطمه نمونه",buyer_phone:i===85?"09123456789":"09000000000",
  city:"شیراز",delivery_address:"نمونه",contact_channel:"card",
  status:i%2?"pending":"confirmed",subtotal_toman:10000,
  created_at:"2026-11-01T09:30:00.000Z"
 }));
}
function makeDb(orders){
 return {
  prepare(sql){
   let values=[];
   const stmt={bind(...args){values=args;return stmt;},async all(){
    assert.match(sql,/ORDER BY created_at DESC,id DESC LIMIT \?/);
    const limit=values.at(-1);
    let next=orders.slice();
    let offset=0;
    if(sql.includes("status=?")){const filterStatus=values[offset++];next=next.filter(o=>o.status===filterStatus);}
    if(sql.includes("instr(lower(code)")){
     const v=values[offset];
     offset+=3;
     next=next.filter(o=>[o.code,o.buyer_phone,o.buyer_name].some(f=>f.toLowerCase().includes(v.toLowerCase())));
    }
    if(sql.includes("(created_at < ?")){
     const at=values[offset],id=values[offset+2];
     next=next.filter(o=>o.created_at<at || (o.created_at===at && o.id<id));
    }
    return {results:next.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id)).slice(0,limit)};
   }};
   return stmt;
  }
 };
}
async function fetchOrders(db,query=""){
 const r=await handleAdminCheckout(new Request("https://shop.example/api/admin/orders"+query),{DB:db});
 return {status:r.status,...await r.json()};
}
test("130 orders all accessible via keyset pages, including historical #81+",async()=>{
 const db=makeDb(makeOrders());
 const seen=new Set();
 let cursor=null,requests=0;
 do{
  const data=await fetchOrders(db,"?limit=25"+(cursor?"&cursor="+encodeURIComponent(cursor):""));
  assert.equal(data.status,200);
  assert.ok(data.orders.length<=25);
  for(const o of data.orders){assert.ok(!seen.has(o.id));seen.add(o.id);}
  cursor=data.nextCursor;requests++;
  assert.ok(requests<12);
 }while(cursor);
 assert.equal(seen.size,130);
});
test("new orders do not shift pagination into duplicates",async()=>{
 const orders=makeOrders();
 const db=makeDb(orders);
 const first=await fetchOrders(db,"?limit=25");
 orders.push({...makeOrders(1)[0],id:"ffffffff-ffff-4fff-8fff-ffffffffffff",code:"NEW"});
 const second=await fetchOrders(db,"?limit=25&cursor="+encodeURIComponent(first.nextCursor));
 assert.equal(second.status,200);
 assert.ok(first.orders.every(x=>!second.orders.some(y=>y.id===x.id)));
});
test("status and phone search combine",async()=>{
 const db=makeDb(makeOrders());
 const data=await fetchOrders(db,"?status=pending&q=09123456789");
 assert.equal(data.status,200);
 assert.equal(data.orders.length,1);
 assert.equal(data.orders[0].buyer_phone,"09123456789");
});
test("invalid cursor, status and overlong search fail safely",async()=>{
 const db=makeDb(makeOrders());
 for(const query of ["?cursor=bad%25","?status=hacked","?q="+encodeURIComponent("الف".repeat(60))]){
  const d=await fetchOrders(db,query);assert.equal(d.status,400);
 }
});
