/* Stable product reference for customer-facing messages, catalog and order history.
   Product UUID is never truncated for persistence; this human-friendly display code
   is a deterministic 48-bit prefix and retains the full UUID in the database. */
(function(global){
 "use strict";
 const fromId=id=>{
  if(typeof id!=="string")return "—";
  const compact=id.replace(/-/g,"").toUpperCase();
  if(!/^[0-9A-F]{32}$/.test(compact))return "—";
  return "ZS-"+compact.slice(0,4)+"-"+compact.slice(4,8)+"-"+compact.slice(8,12);
 };
 global.ZebarProductCode=Object.freeze({fromId});
})(window);
