/* Zebar Sangari Checkout v2: guest delivery -> review -> manual payment instructions.
   No payment processing and no receipt files uploaded to this origin. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const money=n=>(Number(n)||0).toLocaleString("fa-IR")+" تومان";
const digits=s=>String(s??"").replace(/[۰-۹]/g,c=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g,c=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
const phone=s=>digits(s).replace(/[\s\-()]/g,"").trim();
const key="zebarsangari_real_cart_v2";
const messages={
  customer_details_required:"اطلاعات تحویل کامل نیست. نام، شماره موبایل، شهر و آدرس را بررسی کن.",
  stock_or_product_changed:"موجودی یکی از کالاها تغییر کرده است. سبد خرید را دوباره بررسی کن.",
  duplicate_variant:"در سبد خرید یک کالا تکراری است. آن را از سبد ویرایش کن.",
  price_changed:"قیمت کالا تغییر کرده است. مبلغ جدید را بررسی و دوباره تأیید کن.",
  orders_disabled:"ثبت سفارش موقتاً غیرفعال است.",
  too_many_orders:"تعداد درخواست‌ها زیاد شده است. کمی بعد دوباره امتحان کن.",
  channel_not_available:"روش تماس فروشگاه تغییر کرده است. صفحه را به‌روزرسانی کن.",
  invalid_order:"اطلاعات سفارش کامل نیست.",
  invalid_items:"سبد خرید معتبر نیست. آن را دوباره بررسی کن.",
  order_service_unavailable:"ارتباط با سامانه سفارش برقرار نشد. کمی بعد دوباره امتحان کن.",
  invalid_origin:"درخواست قابل تأیید نیست؛ صفحه را تازه‌سازی کن.",
  stock_or_price_changed:"موجودی یا قیمت تغییر کرده است. سفارش را دوباره بررسی کن."
};
let settings={},items=[],subtotal=0,order=null,step=1,sending=false;
function alertText(value,isGood=false){
 const el=$("alert");el.hidden=false;el.className="notice"+(isGood?" ok":"");el.textContent=value;
 el.scrollIntoView({behavior:"smooth",block:"start"});
}
function clearAlert(){$("alert").hidden=true;}
async function fetchJSON(url,options){
 let response;
 try{response=await fetch(url,{cache:"no-store",...options});}
 catch{throw Error("اتصال اینترنت را بررسی کن و دوباره تلاش کن.");}
 let data;try{data=await response.json()}catch{throw Error("پاسخ سرور قابل خواندن نیست. دوباره تلاش کن.");}
 if(!response.ok){
  const error=new Error(messages[data.error]||"درخواست انجام نشد. دوباره تلاش کن.");
  error.code=data.error;throw error;
 }
 return data;
}
const fieldError=(id,text)=>{
 const el=$(id),target=$("error-"+id);
 if(target)target.textContent=text||"";
 if(el)el.setAttribute("aria-invalid",text?"true":"false");
 return !text;
};
function validate(id){
 const raw=$(id).value.trim();
 let error="";
 if(id==="buyerName" && raw.length<3)error="نام و نام خانوادگی را کامل وارد کن.";
 if(id==="buyerPhone" && !/^(\+98|0)?9\d{9}$/.test(phone(raw)))error="شماره موبایل معتبر وارد کن؛ مثلاً 09121234567.";
 if(id==="city" && !raw)error="شهر را وارد کن.";
 if(id==="address" && raw.length<8)error="آدرس کامل شامل خیابان، پلاک و واحد را وارد کن.";
 fieldError(id,error);return !error;
}
const fields=["buyerName","buyerPhone","city","address"];
for(const id of fields){
 $(id).addEventListener("blur",()=>{if($(id).value)validate(id);});
 $(id).addEventListener("input",()=>{if($(id).getAttribute("aria-invalid")==="true")validate(id);});
}
$("consent").addEventListener("change",()=>{$("error-consent").textContent="";});
function validateForm(){
 let first=null;
 for(const id of fields)if(!validate(id)&&!first)first=$(id);
 if(!$("consent").checked){
  $("error-consent").textContent="برای ادامه، رضایت به استفاده از اطلاعات سفارش لازم است.";
  first ||= $("consent");
 }
 if(first){first.focus({preventScroll:true});first.scrollIntoView({behavior:"smooth",block:"center"});return false;}
 return true;
}
function showStep(n){
 step=n;clearAlert();
 const names=["detailsStage","reviewStage","completeStage"];
 names.forEach((id,i)=>$(id).hidden=i!==n-1);
 for(let i=1;i<=3;i++){
  const el=$("progress"+i);
  el.classList.toggle("active",i===n);el.classList.toggle("done",i<n);
  if(i===n)el.setAttribute("aria-current","step");else el.removeAttribute("aria-current");
 }
 $("summaryCard").hidden=n===3;
 if(n===3)$("orderCode").focus?.();
 window.scrollTo({top:0,behavior:"smooth"});
}
function renderSummary(){
 $("cartLines").replaceChildren();
 let count=0;
 for(const item of items){
  count+=item.qty;
  const row=document.createElement("div");row.className="item";
  const info=document.createElement("div");
  const title=document.createElement("b");title.textContent=item.title;
  const sub=document.createElement("small");sub.textContent="سایز "+item.size+" · "+item.color+" · "+item.qty.toLocaleString("fa-IR")+" عدد";
  info.append(title,sub);
  const price=document.createElement("span");price.className="price";price.textContent=money(item.price*item.qty);
  row.append(info,price);$("cartLines").append(row);
 }
 $("itemCount").textContent=count.toLocaleString("fa-IR")+" کالا";
 $("subtotal").textContent=money(subtotal);$("finalTotal").textContent=money(subtotal);
 const details=$("orderDetails");
 if(window.innerWidth<=780)details.open=false;
}
async function loadBasket(){
 settings=await fetchJSON("/api/shop-settings");
 if(!settings.ordersEnabled)throw Error("ثبت سفارش در حال حاضر فعال نیست.");
 let cart;
 try{cart=JSON.parse(localStorage.getItem(key)||"[]");}catch{cart=[];}
 if(!Array.isArray(cart)||!cart.length)throw Error("سبد خرید خالی است. ابتدا از فروشگاه محصول انتخاب کن.");
 const result=await fetchJSON("/api/products");
 const index=new Map((result.products||[]).map(p=>[p.id,p]));
 const grouped=new Map();
 for(const entry of cart){
  const product=index.get(entry.id);
  if(!product||!Number.isSafeInteger(entry.qty)||entry.qty<1)throw Error("یکی از کالاهای سبد دیگر موجود نیست. سبد را بررسی کن.");
  const variant=product.variants?.find(v=>v.size===entry.size&&v.color===entry.color);
  if(!variant)throw Error("یکی از سایزها یا رنگ‌های سبد دیگر موجود نیست.");
  const current=grouped.get(variant.id);
  const quantity=(current?.qty||0)+entry.qty;
  if(quantity>20||quantity>variant.stock)throw Error("موجودی یکی از سایزها کافی نیست. سبد را اصلاح کن.");
  grouped.set(variant.id,{productId:product.id,variantId:variant.id,title:product.title,
   size:variant.size,color:variant.color,qty:quantity,price:Number(product.priceToman)||0});
 }
 items=[...grouped.values()];
 if(!items.length||items.length>12)throw Error("تعداد تنوع کالا در سبد بیش از حد مجاز است.");
 subtotal=items.reduce((sum,i)=>sum+i.qty*i.price,0);
 renderSummary();
}
function details(){
 return {buyerName:$("buyerName").value.trim(),buyerPhone:phone($("buyerPhone").value),
  city:$("city").value.trim(),address:$("address").value.trim()};
}
$("detailsForm").addEventListener("submit",event=>{
 event.preventDefault();clearAlert();
 if(!validateForm())return;
 const d=details();
 $("reviewAddress").textContent=d.buyerName+"\n"+d.buyerPhone+"\n"+d.city+"، "+d.address;
 $("reviewItems").textContent=items.map(i=>i.title+" — "+i.size+" / "+i.color+" × "+i.qty.toLocaleString("fa-IR")).join("\n");
 $("reviewTotal").textContent=money(subtotal);
 showStep(2);
});
$("editDetails").onclick=$("backDetails").onclick=()=>showStep(1);
function channel(){
 if(settings.cardNumber)return "card";
 if(settings.whatsapp)return "whatsapp";
 if(settings.telegram)return "telegram";
 return null;
}
$("submitOrder").onclick=async()=>{
 if(sending||!validateForm()){if(step===2)showStep(1);return;}
 const c=channel();
 if(!c){alertText("هیچ روش پرداخت یا ارتباطی در فروشگاه تنظیم نشده است.");return;}
 sending=true;$("submitOrder").disabled=true;
 try{
  const payload={...details(),channel:c,expectedSubtotalToman:subtotal,
   items:items.map(i=>({productId:i.productId,variantId:i.variantId,quantity:i.qty}))};
  order=await fetchJSON("/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  try{localStorage.removeItem(key);}catch{}
  renderComplete();showStep(3);
 }catch(error){
  if(error.code==="customer_details_required"){showStep(1);alertText(error.message);}
  else if(error.code==="price_changed"||error.code==="stock_or_product_changed"){
   try{await loadBasket();$("reviewTotal").textContent=money(subtotal);}catch(err){alertText(err.message);return;}
   alertText(error.message);
  }else alertText(error.message);
 }finally{sending=false;$("submitOrder").disabled=false;}
};
async function copy(value,el){
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);
  else{
   const t=document.createElement("textarea");t.value=value;t.style.position="fixed";t.style.opacity="0";
   document.body.append(t);t.select();const ok=document.execCommand("copy");t.remove();if(!ok)throw Error("copy_failed");
  }
  if(el)el.textContent="کپی شد ✓";return true;
 }catch{if(el)el.textContent="کپی نشد؛ متن را لمس طولانی و کپی کن.";return false;}
}
const summaryMessage=()=>"سلام، سفارش زبرسنگری با کد "+order.code+" ثبت کردم. جمع کالاها "+money(order.subtotalToman)+" است. لطفاً هزینه ارسال و مبلغ نهایی را اعلام کنید. رسید پرداخت را جداگانه ارسال می‌کنم.";
function addMessenger(label,url,iconText){
 const a=document.createElement("a");a.className="link";a.href=url;a.target="_blank";a.rel="noopener noreferrer";
 const icon=document.createElement("i");icon.textContent=iconText;
 const name=document.createElement("span");name.textContent=label;
 const arrow=document.createElement("span");arrow.className="arrow";arrow.textContent="←";
 a.append(icon,name,arrow);$("messengerLinks").append(a);
}
function renderComplete(){
 $("orderCode").textContent=order.code;
 if(settings.cardNumber){
  $("paymentCard").hidden=false;$("noCard").hidden=true;
  $("cardNumber").textContent=window.ZebarBank?.format(settings.cardNumber)||settings.cardNumber;
  $("cardHolder").textContent=settings.cardHolder?"به نام "+settings.cardHolder:"";
  const b=window.ZebarBank?.identify(settings.cardNumber);
  $("bankName").textContent=b?"بانک "+b.name.replace(/^بانک\s*/,""):"";
 }else{$("paymentCard").hidden=true;$("noCard").hidden=false;}
 $("messengerLinks").replaceChildren();
 if(settings.whatsapp)addMessenger("ارسال رسید از واتساپ","https://wa.me/"+settings.whatsapp+"?text="+encodeURIComponent(summaryMessage()),"و");
 if(settings.telegram)addMessenger("ارسال رسید از تلگرام","https://t.me/"+settings.telegram,"ت");
 if(settings.baleUsername)addMessenger("ارسال رسید از بله","https://ble.ir/"+settings.baleUsername,"ب");
 else if(settings.balePhone){
  addMessenger("باز کردن بله","https://web.bale.ai/","ب");
  $("baleHelp").hidden=false;
  $("baleHelp").textContent="شماره بله فروشگاه: "+settings.balePhone+" — شماره را در بله جست‌وجو و رسید را ارسال کن.";
 }
 if(!$("messengerLinks").children.length){
  const note=document.createElement("p");note.className="muted";note.textContent="برای ارسال رسید با شماره تماس فروشگاه هماهنگ کن.";
  $("messengerLinks").append(note);
 }
}
$("copyCard").onclick=()=>copy(window.ZebarBank?.normalize(settings.cardNumber)||settings.cardNumber,$("copyFeedback"));
$("copyCode").onclick=()=>copy(order?.code||"",null).then(ok=>{if(ok)$("copyCode").textContent="کپی شد ✓";});
$("copyMessage").onclick=()=>copy(summaryMessage(),$("messageFeedback"));
(async()=>{
 try{await loadBasket();$("loading").hidden=true;$("layout").hidden=false;showStep(1);}
 catch(error){$("loading").textContent=error.message; }
})();
})();