/* Zebar Sangari boutique storefront. D1 catalog; same basket storage key as /checkout.html. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const fa=n=>Number(n||0).toLocaleString("fa-IR");
const toman=n=>fa(n)+" تومان";
const label={women:"زنانه",men:"مردانه",kids:"بچگانه",socks:"جوراب",accessories:"اکسسوری"};
const cartKey="zebarsangari_real_cart_v2";
const modal=$("product-modal"),drawer=$("drawer"),overlay=$("overlay");
let catalog=[],cart=[],settings={},loaded=false,category="all",query="",sort="latest",selected=null,selSize="",selColor="",lastFocus=null;
const validImage=key=>typeof key==="string" && /^p\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(webp|png|jpg)$/.test(key);
const imageOf=p=>{const k=p.images?.[0]?.key;return validImage(k)?"/media/"+k:null;};
const stockOf=p=>p.variants.reduce((sum,v)=>sum+Math.max(0,Number(v.stock)||0),0);
const uniq=items=>[...new Set(items)];
const activeVariants=p=>p?.variants?.filter(v=>Number(v.stock)>0)||[];
function findVariant(p,size,color){return p?.variants?.find(v=>v.size===size&&v.color===color&&Number(v.stock)>0);}
function byId(id){return catalog.find(p=>p.id===id);}
function safeLoad(){
 try{
  const data=JSON.parse(localStorage.getItem(cartKey)||"[]");
  return Array.isArray(data)?data.filter(x=>x && typeof x.id==="string"&&typeof x.size==="string"&&typeof x.color==="string"&&Number.isInteger(x.qty)&&x.qty>0):[];
 }catch{return [];}
}
function save(){try{localStorage.setItem(cartKey,JSON.stringify(cart));}catch{}}
function sanitizeCart(){
 if(!loaded)return;
 cart=cart.filter(x=>{const p=byId(x.id);return p&&findVariant(p,x.size,x.color)});
 for(const item of cart){const v=findVariant(byId(item.id),item.size,item.color);item.qty=Math.min(20,Number(v.stock),item.qty);}
 save();
}
function toast(text){const el=$("toast");el.textContent=text;el.classList.add("show");clearTimeout(toast.handle);toast.handle=setTimeout(()=>el.classList.remove("show"),2400);}
function placeholder(){
 const div=document.createElement("div");div.className="product-placeholder";
 div.innerHTML='<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M35 19c-2-6 2-10 7-10s9 4 9 9c0 5-10 7-10 14L12 52c-4 3-2 8 2 8h55c4 0 6-5 2-8L41 32"/><path d="M41 43c-4-7-12-2-12 4s12 12 12 12 12-7 12-12-8-11-12-4Z"/></svg>';
 return div;
}
function picture(product){
 const url=imageOf(product);
 if(!url)return placeholder();
 const img=document.createElement("img");img.loading="lazy";img.alt=product.title;
 img.src=url;img.onerror=()=>img.replaceWith(placeholder());
 return img;
}
function discounted(p){return Number(p.compareAtToman)>Number(p.priceToman)&&Number(p.priceToman)>0;}
function discountPct(p){return discounted(p)?Math.round((1-p.priceToman/p.compareAtToman)*100):0;}
function renderProducts(){
 if(!loaded)return;
 const grid=$("product-grid");grid.replaceChildren();
 let result=catalog.filter(p=>{
  const matchCategory=category==="all"||p.category===category;
  const matchSearch=(p.title+" "+p.description+" "+(label[p.category]||"")).toLocaleLowerCase("fa").includes(query.toLocaleLowerCase("fa"));
  return matchCategory&&matchSearch;
 });
 if(sort==="cheapest")result.sort((a,b)=>a.priceToman-b.priceToman);
 else if(sort==="expensive")result.sort((a,b)=>b.priceToman-a.priceToman);
 else if(sort==="sale")result.sort((a,b)=>discountPct(b)-discountPct(a));
 $("products-count").textContent=fa(result.length)+" محصول";
 $("catalog-caption").textContent=category==="all"?"محصولات واقعی ثبت‌شده در فروشگاه":("مجموعه "+(label[category]||""));
 if(!result.length){
  const empty=document.createElement("div");empty.className="empty";
  const strong=document.createElement("strong");strong.textContent=query?"محصولی با این نام پیدا نشد.":"هنوز محصولی در این دسته ثبت نشده است.";
  const small=document.createElement("span");small.textContent=query?"عبارت جست‌وجو را تغییر بده.":"برای مشاهده دسته‌های دیگر از فیلترها استفاده کن.";
  empty.append(strong,small);grid.append(empty);return;
 }
 for(const p of result){
  const card=document.createElement("article");card.className="product-card";
  const pictureWrap=document.createElement("div");pictureWrap.className="product-image";
  pictureWrap.append(picture(p));
  const badge=document.createElement("span");
  if(discounted(p)){badge.className="product-badge";badge.textContent=fa(discountPct(p))+"٪ تخفیف";pictureWrap.append(badge);}
  else if(stockOf(p)===0){badge.className="product-badge new";badge.textContent="ناموجود";pictureWrap.append(badge);}
  const quick=document.createElement("button");quick.type="button";quick.className="product-quick";
  quick.textContent=stockOf(p)>0?"مشاهده و انتخاب سایز ←":"مشاهده محصول";
  quick.addEventListener("click",()=>openProduct(p.id));
  pictureWrap.append(quick);pictureWrap.addEventListener("click",e=>{if(e.target.closest("button"))return;openProduct(p.id);});
  const info=document.createElement("div");info.className="product-info";
  const categoryTag=document.createElement("span");categoryTag.className="product-kind";categoryTag.textContent=label[p.category]||"محصول";
  const name=document.createElement("h3");name.textContent=p.title;
  const prices=document.createElement("div");prices.className="product-price";
  const price=document.createElement("span");price.textContent=toman(p.priceToman);prices.append(price);
  if(discounted(p)){const old=document.createElement("del");old.textContent=toman(p.compareAtToman);prices.append(old);}
  const variations=document.createElement("div");variations.className="product-colors";variations.textContent=fa(uniq(activeVariants(p).map(v=>v.size)).length)+" سایز · "+fa(uniq(activeVariants(p).map(v=>v.color)).length)+" رنگ";
  info.append(categoryTag,name,prices,variations);card.append(pictureWrap,info);grid.append(card);
 }
}
function setCategory(value){
 category=label[value]||value==="all"?value:"all";
 document.querySelectorAll("[data-filter]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.filter===category)));
 renderProducts();
}
document.querySelectorAll("[data-filter]").forEach(btn=>btn.addEventListener("click",()=>setCategory(btn.dataset.filter)));
document.querySelectorAll("[data-category],[data-menu-cat]").forEach(a=>a.addEventListener("click",()=>{
 setCategory(a.dataset.category||a.dataset.menuCat);closeMenu();
}));
$("product-search").addEventListener("input",e=>{query=e.target.value.trim();renderProducts();});
$("sort-products").addEventListener("change",e=>{sort=e.target.value;renderProducts();});
function searchFocus(){
 const input=$("product-search");input.scrollIntoView({behavior:"smooth",block:"center"});input.focus({preventScroll:true});
}
$("search-toggle").addEventListener("click",()=>{
 const panel=$("search-panel");panel.hidden=!panel.hidden;$("search-toggle").setAttribute("aria-expanded",String(!panel.hidden));
 if(!panel.hidden)$("header-search").focus();
});
$("header-search-submit").addEventListener("click",()=>{
 query=$("header-search").value.trim();$("product-search").value=query;setCategory("all");$("search-panel").hidden=true;
 $("search-toggle").setAttribute("aria-expanded","false");searchFocus();
});
$("header-search").addEventListener("keydown",e=>{if(e.key==="Enter")$("header-search-submit").click();});
function closeMenu(){$("mobile-menu").hidden=true;$("mobile-menu-toggle").setAttribute("aria-expanded","false");}
$("mobile-menu-toggle").addEventListener("click",()=>{
 const el=$("mobile-menu");el.hidden=!el.hidden;$("mobile-menu-toggle").setAttribute("aria-expanded",String(!el.hidden));
});
$("mobile-menu").querySelectorAll("a").forEach(a=>a.addEventListener("click",closeMenu));
const slides=[
 {over:"ZEBAR SANGARI / DAILY COMFORT",title:"سادگیِ شیک،<br><span>راحتیِ هر روز.</span>",desc:"مجموعه‌ای از لباس‌های راحت و خوش‌دوخت برای بانوان، آقایان و کودکان؛ با انتخاب آسان سایز و رنگ.",number:"01 / 03",cta:"مشاهده محصولات",cat:"all"},
 {over:"SOFT ESSENTIALS / WOMEN",title:"انتخابی لطیف،<br><span>برای بانوان.</span>",desc:"مدل‌های زنانه در یک مجموعه مرتب و راحت برای جست‌وجو.",number:"02 / 03",cta:"مجموعه زنانه",cat:"women"},
 {over:"FAMILY COLLECTION / EVERYDAY",title:"از کوچک تا بزرگ،<br><span>همراه هر روز.</span>",desc:"از پوشاک مردانه تا مدل‌های بچگانه و جوراب؛ همه در کنار هم.",number:"03 / 03",cta:"کاوش دسته‌ها",cat:"all"}
];
let slide=0;
function showSlide(i){
 slide=i;const a=slides[i];
 $("hero-overline").textContent=a.over;$("hero-title").innerHTML=a.title;$("hero-description").textContent=a.desc;
 $("hero-count").textContent=a.number;$("hero-cta").firstChild.textContent=a.cta+" ";
 $("hero-visual").style.filter=i===1?"hue-rotate(7deg)":i===2?"hue-rotate(-18deg)":"none";
 document.querySelectorAll(".hero-dot").forEach((b,j)=>{b.classList.toggle("active",i===j);if(i===j)b.setAttribute("aria-current","true");else b.removeAttribute("aria-current");});
}
document.querySelectorAll(".hero-dot").forEach(b=>b.addEventListener("click",()=>showSlide(Number(b.dataset.slide))));
$("hero-cta").addEventListener("click",()=>setCategory(slides[slide].cat));
function openLayer(type){
 lastFocus=document.activeElement;overlay.hidden=false;document.body.classList.add("lock");
 if(type==="drawer"){drawer.classList.add("open");drawer.setAttribute("aria-hidden","false");$("drawer-close").focus();}
 else{modal.classList.add("open");modal.setAttribute("aria-hidden","false");$("modal-close").focus();}
}
function closeLayers(){
 overlay.hidden=true;document.body.classList.remove("lock");
 drawer.classList.remove("open");drawer.setAttribute("aria-hidden","true");
 modal.classList.remove("open");modal.setAttribute("aria-hidden","true");
 lastFocus?.focus?.({preventScroll:true});
}
overlay.addEventListener("click",closeLayers);$("drawer-close").addEventListener("click",closeLayers);$("modal-close").addEventListener("click",closeLayers);
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeLayers();closeMenu();}});
function openProduct(id){
 selected=byId(id);if(!selected)return;
 const vs=activeVariants(selected);
 selSize=vs[0]?.size||"";selColor=vs[0]?.color||"";
 renderModal();openLayer("modal");
}
function renderModal(){
 const p=selected;if(!p)return;
 const box=$("modal-content");box.replaceChildren();
 const row=document.createElement("div");row.className="modal-grid";
 const art=document.createElement("div");art.className="modal-picture";art.append(picture(p));
 const info=document.createElement("div");info.className="modal-details";
 const caption=document.createElement("small");caption.className="caption";caption.textContent=(label[p.category]||"محصول")+" / زبرسنگری";
 const title=document.createElement("h2");title.textContent=p.title;
 const price=document.createElement("div");price.className="modal-price";price.textContent=toman(p.priceToman);
 const desc=document.createElement("p");desc.className="text";desc.textContent=p.description||"";
 info.append(caption,title,price,desc);
 const variants=activeVariants(p);
 if(variants.length){
  const sizes=uniq(variants.map(v=>v.size));if(!sizes.includes(selSize))selSize=sizes[0];
  const colors=uniq(variants.filter(v=>v.size===selSize).map(v=>v.color));if(!colors.includes(selColor))selColor=colors[0];
  const sl=document.createElement("span");sl.className="variant-label";sl.textContent="سایز";
  const sizeList=document.createElement("div");sizeList.className="options";
  sizes.forEach(size=>{const button=document.createElement("button");button.className="option"+(size===selSize?" active":"");button.textContent=size;button.type="button";button.setAttribute("aria-pressed",String(size===selSize));button.onclick=()=>{selSize=size;selColor="";renderModal();};sizeList.append(button);});
  const cl=document.createElement("span");cl.className="variant-label";cl.textContent="رنگ";
  const colorList=document.createElement("div");colorList.className="options";
  colors.forEach(color=>{const button=document.createElement("button");button.className="option"+(color===selColor?" active":"");button.textContent=color;button.type="button";button.setAttribute("aria-pressed",String(color===selColor));button.onclick=()=>{selColor=color;renderModal();};colorList.append(button);});
  const variant=findVariant(p,selSize,selColor);
  const stock=document.createElement("p");stock.className="stock-label";stock.textContent="موجودی این مدل: "+fa(variant?.stock||0)+" عدد";
  const add=document.createElement("button");add.type="button";add.className="btn btn-primary modal-add";add.textContent="افزودن به سبد خرید +";
  add.addEventListener("click",()=>addToCart(p,selSize,selColor));
  info.append(sl,sizeList,cl,colorList,stock,add);
 }else{
  const note=document.createElement("p");note.textContent="این محصول فعلاً موجود نیست.";note.className="stock-label";info.append(note);
 }
 row.append(art,info);box.append(row);
}
function addToCart(p,size,color){
 const v=findVariant(p,size,color);
 if(!v)return toast("این ترکیب سایز و رنگ موجود نیست.");
 const c=cart.find(x=>x.id===p.id&&x.size===size&&x.color===color);
 if(c && c.qty>=Math.min(20,Number(v.stock)))return toast("موجودی این مدل کافی نیست.");
 if(c)c.qty++;else cart.push({id:p.id,size,color,qty:1});
 save();updateBasket();closeLayers();toast("محصول به سبد خرید اضافه شد ♡");
}
function countCart(){return cart.reduce((n,c)=>n+c.qty,0);}
function updateBasket(){
 const list=$("basket-list");list.replaceChildren();
 const count=countCart();$("cart-count").textContent=fa(count);$("dock-count").textContent=fa(count);
 const total=cart.reduce((s,c)=>s+((byId(c.id)?.priceToman)||0)*c.qty,0);
 $("basket-total").textContent=toman(total);
 if(!count){const empty=document.createElement("div");empty.className="empty";empty.textContent="سبد خریدت هنوز خالی است.";list.append(empty);}
 else for(const c of cart){
  const p=byId(c.id);if(!p)continue;
  const row=document.createElement("div");row.className="basket-line";
  const thumb=picture(p);thumb.className="basket-thumb";
  const content=document.createElement("div");
  const title=document.createElement("b");title.textContent=p.title;
  const meta=document.createElement("small");meta.textContent="سایز "+c.size+" · "+c.color;
  const price=document.createElement("strong");price.textContent=toman(p.priceToman*c.qty);
  const qty=document.createElement("div");qty.className="qty";
  const minus=document.createElement("button");minus.type="button";minus.textContent="−";minus.ariaLabel="کم کردن تعداد";
  const amount=document.createElement("span");amount.textContent=fa(c.qty);
  const plus=document.createElement("button");plus.type="button";plus.textContent="+";plus.ariaLabel="افزودن تعداد";
  const remove=document.createElement("button");remove.type="button";remove.textContent="حذف";remove.className="remove";
  function change(delta){
   const v=findVariant(p,c.size,c.color);
   const limit=Math.min(Number(v?.stock||0),20);
   if(delta>0 && c.qty>=limit){toast("موجودی کافی نیست.");return;}
   c.qty+=delta;if(c.qty<=0)cart=cart.filter(x=>x!==c);
   save();updateBasket();
  }
  minus.onclick=()=>change(-1);plus.onclick=()=>change(1);remove.onclick=()=>{cart=cart.filter(x=>x!==c);save();updateBasket();};
  qty.append(minus,amount,plus,remove);content.append(title,meta,price,qty);row.append(thumb,content);list.append(row);
 }
 $("checkout-link").hidden=!settings.ordersEnabled || count===0;
 $("checkout-unavailable").hidden=Boolean(settings.ordersEnabled && count>0);
 if(!settings.ordersEnabled)$("checkout-unavailable").textContent="سفارش‌گیری فعلاً غیرفعال است";
 else $("checkout-unavailable").textContent="سبد خرید خالی است";
}
function showBasket(){updateBasket();openLayer("drawer");}
$("cart-trigger").onclick=showBasket;$("dock-cart").onclick=showBasket;
function appendContact(root,text,href){
 const link=document.createElement("a");link.href=href;link.target=href.startsWith("http")?"_blank":"_self";
 if(link.target==="_blank")link.rel="noopener noreferrer";
 link.textContent=text;root.append(link);
}
async function loadSettings(){
 try{
  const res=await fetch("/api/shop-settings",{cache:"no-store"});if(!res.ok)throw Error("settings");
  const data=await res.json();settings=data;
  const root=$("contact-links");root.replaceChildren();
  if(data.phone && /^\+?[\d -]{7,20}$/.test(data.phone))appendContact(root,"تلفن: "+data.phone,"tel:"+data.phone.replace(/[^\d+]/g,""));
  if(data.whatsapp && /^\d{8,15}$/.test(data.whatsapp))appendContact(root,"واتساپ فروشگاه","https://wa.me/"+data.whatsapp);
  if(data.telegram && /^[a-z][a-z0-9_]{4,31}$/i.test(data.telegram))appendContact(root,"تلگرام فروشگاه","https://t.me/"+data.telegram);
  if(data.baleUsername && /^[a-z][a-z0-9_]{4,31}$/i.test(data.baleUsername))appendContact(root,"بله فروشگاه","https://ble.ir/"+data.baleUsername);
  if(!root.children.length)root.textContent="راه‌های تماس هنوز ثبت نشده‌اند.";
 }catch{
  $("contact-links").textContent="اطلاعات تماس فعلاً قابل دریافت نیست.";
 }
 updateBasket();
}
async function loadCatalog(){
 const grid=$("product-grid");
 try{
  const res=await fetch("/api/products",{cache:"no-store"});if(!res.ok)throw Error("catalog");
  const data=await res.json();
  if(!Array.isArray(data.products))throw Error("invalid");
  catalog=data.products.map(p=>({
   id:String(p.id),title:String(p.title||""),description:String(p.description||""),
   category:String(p.category||""),priceToman:Math.max(0,Number(p.priceToman)||0),
   compareAtToman:Math.max(0,Number(p.compareAtToman)||0),
   images:Array.isArray(p.images)?p.images:[],
   variants:Array.isArray(p.variants)?p.variants.map(v=>({size:String(v.size),color:String(v.color),stock:Math.max(0,Number(v.stock)||0)})):[]
  }));
  loaded=true;sanitizeCart();renderProducts();updateBasket();
 }catch{
  grid.replaceChildren();const block=document.createElement("div");block.className="empty";block.textContent="دریافت محصولات ممکن نشد. اتصال را بررسی و صفحه را تازه‌سازی کن.";grid.append(block);
 }
}
cart=safeLoad();
updateBasket();
loadCatalog();
loadSettings();
window.addEventListener("pageshow",event=>{if(event.persisted){cart=safeLoad();loadCatalog();loadSettings();}});
})();