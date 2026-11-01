/* Shared, dependency-free catalog pagination for storefront and checkout. */
(()=>{
"use strict";
async function load(fetchPage,requiredIds=null){
  const wanted=requiredIds?new Set(requiredIds):null;
  const seenIds=new Set(),seenCursors=new Set(),products=[];
  let cursor=null;
  // Finite bound protects phones if the API sends a broken cyclic cursor.
  for(let page=0;page<100;page++){
    const result=await fetchPage(cursor);
    if(!result||!Array.isArray(result.products))throw Error("invalid_catalog_page");
    for(const product of result.products){
      if(!product||typeof product.id!=="string"||seenIds.has(product.id))throw Error("duplicate_catalog_item");
      seenIds.add(product.id);
      products.push(product);
      if(wanted)wanted.delete(product.id);
    }
    if(wanted&&wanted.size===0)return products;
    if(result.nextCursor==null)return products; // Backward compatible with older Workers.
    if(typeof result.nextCursor!=="string"||!result.nextCursor||seenCursors.has(result.nextCursor)||result.products.length===0)
      throw Error("invalid_catalog_cursor");
    seenCursors.add(result.nextCursor);
    cursor=result.nextCursor;
  }
  throw Error("catalog_page_limit");
}
window.ZebarCatalogPages=Object.freeze({load});
})();
