/* Manual checkout - no automated payment confirmation. */
(()=>{
"use strict";
const $=id=>document.getElementById(id), money=n=>(Number(n)||0).toLocaleString("fa-IR")+" تومان";
const cartKey="zebarsangari_real_cart_v2";
const fmt=x=>String(x??"");
let settings={},items=[],order=null,cart=[],subtotal=0;
const message=(value,ok=false)=>{
 const n=$("message");n.textContent=value;n.className=ok?"ok":"";n.classList.remove("hidden");n.scrollIntoView({behavior:"smooth"});
};
const xjson=async response=>{
 let data;try{data=await response.json()}catch{throw Error("پاسخ نامعتبر سرور");}
 if(!response.ok)throw Error(data.error||"خطا در درخواست");
 return data;
};
const normalize=s=>fmt(s).replace(/[۰-۹]/g,c=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g,c=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
function renderItems(){
 const wrap=$("lineItems");wrap.replaceChildren();
 for(const item of items){
  const d=document.createElement("div");d.className="item";
  const left=document.createElement("div");
  const title=document.createElement("strong");title.textContent=item.title;
  const small=document.createElement("small");
  small.textContent="سایز: "+item.size+" · رنگ: "+item.color+" · تعداد: "+item.qty;
  left.append(title,small);
  const amount=document.createElement("span");amount.className="money";amount.textContent=money(item.price*item.qty);
  d.append(left,amount);wrap.append(d);
 }
 $("total").textContent=money(subtotal);
}
function renderChannels(){
 const choices=[["whatsapp","واتساپ",Boolean(settings.whatsapp)],["telegram","تلگرام",Boolean(settings.telegram)],["card","کارت‌به‌کارت",Boolean(settings.cardNumber)]];
 $("channels").replaceChildren();
 choices.filter(c=>c[2]).forEach(([id,label])=>{
  const el=document.createElement("label");el.className="channel";
  const input=document.createElement("input");input.type="radio";input.name="channel";input.value=id;input.required=true;
  if(!$("channels").children.length)input.checked=true;
  const text=document.createElement("span");text.textContent=label;
  el.append(input,text);$("channels").append(el);
 });
}
async function init(){
 try{
  settings=await xjson(await fetch("/api/shop-settings",{cache:"no-store"}));
  if(!settings.ordersEnabled){$("notReady").textContent="ثبت سفارش هنوز از طرف فروشگاه فعال نشده است.";return;}
  try{cart=JSON.parse(localStorage.getItem(cartKey)||"[]");}catch{cart=[];}
  if(!Array.isArray(cart)||!cart.length){$("notReady").textContent="سبد خرید خالی است. ابتدا محصول انتخاب کن.";return;}
  const response=await xjson(await fetch("/api/products",{cache:"no-store"}));
  const byId=new Map((response.products||[]).map(p=>[p.id,p]));
  for(const c of cart){
   const p=byId.get(c.id);
   const v=p?.variants?.find(x=>x.size===c.size&&x.color===c.color&&x.stock>=c.qty);
   if(!p||!v||!Number.isInteger(c.qty)||c.qty<1||c.qty>20)
    throw Error("سبد خرید تغییر کرده است؛ به فروشگاه برگرد و آن را دوباره بررسی کن.");
   items.push({productId:p.id,variantId:v.id,title:p.title,size:v.size,color:v.color,qty:c.qty,price:p.priceToman});
   subtotal+=p.priceToman*c.qty;
  }
  renderItems();renderChannels();
  if(!$("channels").children.length){$("notReady").textContent="فروشگاه هنوز روش سفارشی تنظیم نکرده است.";return;}
  $("notReady").classList.add("hidden");$("checkoutArea").classList.remove("hidden");
 }catch(error){$("notReady").textContent=error.message;}
}
function addLink(url,label){
 const a=document.createElement("a");a.className="btn secondary";a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=label;
 $("contactLinks").append(a);
}
const summary=()=>"سلام، سفارش زبرسنگری با کد "+order.code+" ثبت کرده‌ام. جمع کالاها "+money(order.subtotalToman)+" است. لطفاً موجودی، هزینه ارسال و مبلغ نهایی را تأیید کنید.";
function done(){
 $("checkoutArea").classList.add("hidden");$("done").classList.remove("hidden");$("code").textContent=order.code;
 $("orderAmount").textContent="جمع کالاها: "+money(order.subtotalToman);
 if(settings.cardNumber){
  $("cardBlock").classList.remove("hidden");
  $("cardNum").textContent=settings.cardNumber.replace(/(\d{4})(?=\d)/g,"$1 ");
  $("cardOwner").textContent="به نام: "+settings.cardHolder;
 }
 if(settings.whatsapp)addLink("https://wa.me/"+settings.whatsapp+"?text="+encodeURIComponent(summary()),"ارسال پیام واتساپ");
 if(settings.telegram)addLink("https://t.me/"+settings.telegram,"بازکردن گفت‌وگوی تلگرام");
 $("done").scrollIntoView({behavior:"smooth"});
}
$("orderForm").addEventListener("submit",async e=>{
 e.preventDefault();const submit=$("place");submit.disabled=true;
 try{
  if(!$("consent").checked)throw Error("تأیید استفاده از اطلاعات لازم است.");
  const body={buyerName:$("buyerName").value,buyerPhone:normalize($("buyerPhone").value),city:$("city").value,address:$("address").value,
   channel:document.querySelector("input[name=channel]:checked")?.value,
   items:items.map(i=>({productId:i.productId,variantId:i.variantId,quantity:i.qty}))};
  order=await xjson(await fetch("/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}));
  localStorage.removeItem(cartKey);done();
  message("درخواست سفارش ثبت شد؛ برای نهایی شدن منتظر تأیید فروشنده باش.",true);
 }catch(err){message("سفارش ثبت نشد: "+err.message);submit.disabled=false;}
});
$("copySummary").onclick=()=>navigator.clipboard.writeText(summary()).then(()=>message("متن سفارش کپی شد.",true)).catch(()=>message("کپی انجام نشد."));
$("copyCard").onclick=()=>navigator.clipboard.writeText(settings.cardNumber).then(()=>message("شماره کارت کپی شد.",true)).catch(()=>message("کپی انجام نشد."));
async function optimizeReceipt(file){
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
 for(const quality of [.86,.73,.59,.42]){
  const result=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
  if(result?.size<590000)return result;
 }
 throw Error("تصویر رسید بزرگ است؛ عکس کوچک‌تری انتخاب کن.");
}
$("sendReceipt").onclick=async()=>{
 const file=$("receiptInput").files?.[0];
 if(!order?.uploadToken||!file)return message("ابتدا سفارش را ثبت کن و عکس رسید را انتخاب کن.");
 const btn=$("sendReceipt");btn.disabled=true;
 try{
  const blob=await optimizeReceipt(file);
  await xjson(await fetch("/api/orders/"+order.orderId+"/receipt",
   {method:"POST",headers:{"content-type":"image/webp","x-order-upload-token":order.uploadToken},body:blob}));
  $("receiptInput").value="";btn.textContent="رسید ارسال شد";
  message("رسید برای بررسی دستی فروشگاه ثبت شد؛ این پیام به معنی تأیید پرداخت نیست.",true);
 }catch(err){message("ارسال رسید ناموفق بود: "+err.message);btn.disabled=false;}
};
init();
})();