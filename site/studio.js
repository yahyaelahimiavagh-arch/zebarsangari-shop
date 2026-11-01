/* Zebar Sangari Store Studio v1. All mutations require existing session + CSRF. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const fa=n=>Number(n||0).toLocaleString("fa-IR");
const errors={
 authentication_required:"جلسه مدیریت تمام شده؛ دوباره وارد شو.",
 migration_required:"ابتدا فایل migrations/0005_store_studio.sql را در D1 اجرا کن.",
 invalid_name:"نام دسته باید بین ۲ تا ۶۴ حرف باشد.",
 invalid_parent:"دسته والد معتبر نیست.",
 category_cycle:"انتخاب این زیردسته باعث ایجاد حلقه می‌شود.",
 category_too_deep:"عمق دسته‌بندی بیش از حد مجاز است.",
 category_in_use:"این دسته دارای محصول یا زیردسته است. ابتدا آن‌ها را منتقل کن.",
 protected_category:"دسته‌های اصلی پیش‌فرض قابل حذف نیستند؛ می‌توانی آن‌ها را پنهان کنی.",
 invalid_order:"ترتیب ارسالی معتبر نیست. اطلاعات را تازه‌سازی کن.",
 invalid_categories:"حداقل یک دسته معتبر برای محصول انتخاب کن.",
 invalid_featured:"وضعیت ویژه معتبر نیست.",
 try_later:"تلاش ورود زیاد بوده است؛ پس از پایان محدودیت دوباره امتحان کن.",
 invalid_login:"رمز مدیریت صحیح نیست.",
 studio_unavailable:"خدمت استودیو موقتاً در دسترس نیست.",
 not_found:"اطلاعات انتخابی پیدا نشد."
};
let csrf="",categories=[],products=[],sections=[],selectedCategory=null,selectedProduct=null,tab="categories",drag=null;
function note(message,bad=false){
 const el=$("notice");el.textContent=message;el.className="notice"+(bad?" bad":"");el.hidden=false;
 clearTimeout(note.timer);note.timer=setTimeout(()=>el.hidden=true,4400);
}
async function api(path,options={}){
 const headers={...(options.json!==undefined?{"content-type":"application/json"}:{}),...(csrf?{"x-csrf-token":csrf}:{})};
 let response;
 try{response=await fetch(path,{method:options.method||"GET",credentials:"same-origin",cache:"no-store",headers,body:options.json!==undefined?JSON.stringify(options.json):undefined});}
 catch{throw Error("اتصال اینترنت برقرار نیست.");}
 let data;try{data=await response.json();}catch{throw Error("پاسخ نامعتبر دریافت شد.");}
 if(!response.ok) {
  if(response.status===401){showLogin();}
  const error=new Error(errors[data.error]||"خطا در ذخیره؛ دوباره تلاش کن.");
  error.code=data.error;throw error;
 }
 return data;
}
function showLogin(){
 $("loginView").hidden=false;$("workspace").hidden=true;$("logout").hidden=true;
 $("password").value="";csrf="";window.scrollTo(0,0);
}
function showWorkspace(){
 $("loginView").hidden=true;$("workspace").hidden=false;$("logout").hidden=false;
}
async function loadAll(){
 const [cats,goods,layout]=await Promise.all([
  api("/api/admin/studio/categories"),api("/api/admin/studio/products"),api("/api/admin/studio/layout")
 ]);
 categories=cats.categories||[];products=goods.products||[];sections=layout.sections||[];
 $("categoryCount").textContent=fa(categories.length);
 $("productCount").textContent=fa(products.length);
 $("featuredCount").textContent=fa(products.filter(p=>p.featured).length);
 renderCategories();renderProducts();renderLayout();resetCatalogEditor(false);
}
function tree(){
 const out=[],visited=new Set();
 function descend(parent,depth){
  const children=categories.filter(c=>c.parentId===parent).sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
  for(const c of children){if(visited.has(c.id))continue;visited.add(c.id);out.push({...c,depth});descend(c.id,depth+1);}
 }
 descend(null,0);
 for(const c of categories)if(!visited.has(c.id))out.push({...c,depth:0});
 return out;
}
function makeButton(text,label,handler,disabled=false){
 const b=document.createElement("button");b.type="button";b.className="tiny";b.textContent=text;b.title=label;
 b.setAttribute("aria-label",label);b.disabled=disabled;b.addEventListener("click",handler);return b;
}
function rowBase(){
 const row=document.createElement("div");row.className="sort-row";
 const grip=document.createElement("span");grip.className="drag-grip";grip.textContent="⠿";grip.setAttribute("aria-hidden","true");
 const content=document.createElement("div");content.className="row-text";
 const action=document.createElement("div");action.className="arrow-buttons";
 row.append(grip,content,action);return {row,content,action};
}
function allowDrop(row,kind,id,onDrop){
 row.draggable=true;
 row.addEventListener("dragstart",e=>{drag={kind,id};e.dataTransfer.effectAllowed="move";row.classList.add("dragging");});
 row.addEventListener("dragend",()=>{row.classList.remove("dragging");drag=null;});
 row.addEventListener("dragover",e=>{if(drag?.kind===kind)e.preventDefault();});
 row.addEventListener("drop",async e=>{
  e.preventDefault();
  if(drag?.kind!==kind||drag.id===id)return;
  try{await onDrop(drag.id,id);}catch(error){note(error.message,true);}
  drag=null;
 });
}
function optionTree(select,selected=null,except=null){
 select.replaceChildren();
 const def=document.createElement("option");def.value="";def.textContent="دسته اصلی";select.append(def);
 for(const c of tree()){
  if(c.id===except)continue;
  const option=document.createElement("option");option.value=c.id;
  option.textContent="— ".repeat(c.depth)+c.name;
  select.append(option);
 }
 select.value=selected||"";
}
function renderCategories(){
 const list=$("categoryList");list.replaceChildren();
 const all=tree();
 optionTree($("newCatParent"));
 const chosen=categories.find(c=>c.id===selectedCategory);
 optionTree($("editCatParent"),chosen?.parentId||null,selectedCategory);
 $("editCatName").disabled=!chosen;$("editCatParent").disabled=!chosen;
 $("editCatVisible").disabled=!chosen;$("saveCategory").disabled=!chosen;
 $("deleteCategory").disabled=!chosen||["women","men","kids","socks","accessories"].includes(chosen.id);
 if(chosen){$("editCatName").value=chosen.name;$("editCatVisible").checked=chosen.visible;}
 else{$("editCatName").value="";$("editCatVisible").checked=false;}
 if(!all.length){list.textContent="هنوز دسته‌ای ثبت نشده است.";return;}
 for(const c of all){
  const {row,content,action}=rowBase();row.classList.toggle("selected",c.id===selectedCategory);
  const title=document.createElement("span");title.className="row-title";title.textContent="↳ ".repeat(c.depth)+c.name;
  const meta=document.createElement("span");meta.className="row-meta";meta.textContent=c.parentId?"زیردسته":"دسته اصلی";
  if(!c.visible){const badge=document.createElement("span");badge.className="badge off";badge.textContent="پنهان";title.append(badge);}
  content.append(title,meta);
  const sib=all.filter(x=>x.parentId===c.parentId),i=sib.findIndex(x=>x.id===c.id);
  action.append(
   makeButton("↑","بالاتر",()=>moveCategory(c.id,-1),i===0),
   makeButton("↓","پایین‌تر",()=>moveCategory(c.id,1),i===sib.length-1),
   makeButton("✎","ویرایش",()=>{selectedCategory=c.id;renderCategories();$("editCatName").focus();})
  );
  content.style.paddingInlineStart=Math.min(4,c.depth)*14+"px";
  row.addEventListener("click",e=>{if(e.target.closest("button"))return;selectedCategory=c.id;renderCategories();});
  allowDrop(row,"category",c.id,swapCategory);
  list.append(row);
 }
}
async function persistCatOrder(ids){
 await api("/api/admin/studio/categories/order",{method:"PUT",json:{ids}});
 await refreshCategories();note("ترتیب دسته‌ها ذخیره شد.");
}
async function moveCategory(id,direction){
 const flat=tree(),item=flat.find(c=>c.id===id);if(!item)return;
 const siblings=flat.filter(c=>c.parentId===item.parentId);
 const i=siblings.findIndex(c=>c.id===id),target=siblings[i+direction];if(!target)return;
 const ids=flat.map(c=>c.id),a=ids.indexOf(id),b=ids.indexOf(target.id);
 [ids[a],ids[b]]=[ids[b],ids[a]];
 try{await persistCatOrder(ids);}catch(e){note(e.message,true);}
}
async function swapCategory(from,to){
 const flat=tree(),a=flat.find(c=>c.id===from),b=flat.find(c=>c.id===to);
 if(!a||!b||a.parentId!==b.parentId){note("جابه‌جایی فقط در یک سطح دسته‌بندی مجاز است.",true);return;}
 const ids=flat.map(c=>c.id),i=ids.indexOf(from),j=ids.indexOf(to);
 [ids[i],ids[j]]=[ids[j],ids[i]];await persistCatOrder(ids);
}
async function refreshCategories(){
 const d=await api("/api/admin/studio/categories");categories=d.categories||[];
 $("categoryCount").textContent=fa(categories.length);renderCategories();renderProducts();
}
$("reloadCategories").onclick=()=>refreshCategories().then(()=>note("فهرست به‌روز شد.")).catch(e=>note(e.message,true));
$("createCategory").addEventListener("submit",async e=>{
 e.preventDefault();const btn=$("addCategory");btn.disabled=true;
 try{
  await api("/api/admin/studio/categories",{method:"POST",json:{name:$("newCatName").value,parentId:$("newCatParent").value||null}});
  $("newCatName").value="";await refreshCategories();note("دسته جدید ساخته شد.");
 }catch(err){note(err.message,true);}finally{btn.disabled=false;}
});
$("editCategory").addEventListener("submit",async e=>{
 e.preventDefault();if(!selectedCategory)return;
 const btn=$("saveCategory");btn.disabled=true;
 try{
  await api("/api/admin/studio/categories/"+selectedCategory,{method:"PATCH",json:{
   name:$("editCatName").value,parentId:$("editCatParent").value||null,visible:$("editCatVisible").checked
  }});
  await refreshCategories();note("ویرایش دسته ذخیره شد.");
 }catch(err){note(err.message,true);}finally{btn.disabled=false;}
});
$("deleteCategory").onclick=async()=>{
 if(!selectedCategory)return;
 const c=categories.find(c=>c.id===selectedCategory);
 if(!confirm("دسته «"+c.name+"» حذف شود؟"))return;
 try{await api("/api/admin/studio/categories/"+selectedCategory,{method:"DELETE"});selectedCategory=null;await refreshCategories();note("دسته حذف شد.");}
 catch(e){note(e.message,true);}
};
function orderedProducts(){return [...products].sort((a,b)=>a.sortOrder-b.sortOrder);}
function renderProducts(){
 const list=$("productList");list.replaceChildren();
 const all=orderedProducts(),query=$("searchProducts").value.trim().toLocaleLowerCase("fa");
 const visible=all.filter(p=>p.title.toLocaleLowerCase("fa").includes(query));
 const chosen=products.find(p=>p.id===selectedProduct);
 $("productFeatured").disabled=!chosen;$("saveProduct").disabled=!chosen;$("editFullProduct").disabled=!chosen;
 $("selectedProductName").textContent=chosen?chosen.title:"یک محصول را انتخاب کن.";
 $("productFeatured").checked=Boolean(chosen?.featured);
 const categoriesBox=$("productCategories");categoriesBox.replaceChildren();
 for(const c of tree()){
  const label=document.createElement("label");label.className="check";label.style.paddingInlineStart=(c.depth*13+4)+"px";
  const cb=document.createElement("input");cb.type="checkbox";cb.value=c.id;cb.checked=Boolean(chosen?.categoryIds?.includes(c.id));cb.disabled=!chosen;
  const span=document.createElement("span");span.textContent=c.name;label.append(cb,span);categoriesBox.append(label);
 }
 if(!visible.length){list.textContent="محصولی پیدا نشد.";return;}
 for(const p of visible){
  const {row,content,action}=rowBase();row.classList.toggle("selected",selectedProduct===p.id);
  const title=document.createElement("span");title.className="row-title";title.textContent=p.title;
  if(p.featured){const badge=document.createElement("span");badge.className="badge";badge.textContent="ویژه";title.append(badge);}
  const meta=document.createElement("span");meta.className="row-meta";meta.textContent=fa(p.priceToman)+" تومان · "+fa(p.categoryIds?.length||0)+" دسته"+(p.active?"":" · غیرفعال");
  content.append(title,meta);const i=all.findIndex(x=>x.id===p.id);
  action.append(
   makeButton("↑","رتبه بالاتر",()=>moveProduct(p.id,-1),Boolean(query)||i===0),
   makeButton("↓","رتبه پایین‌تر",()=>moveProduct(p.id,1),Boolean(query)||i===all.length-1),
   makeButton("✎","تنظیم محصول",()=>{selectedProduct=p.id;renderProducts();$("productFeatured").focus();})
  );
  row.onclick=e=>{if(e.target.closest("button"))return;selectedProduct=p.id;renderProducts();};
  if(!query)allowDrop(row,"product",p.id,swapProduct);
  list.append(row);
 }
}
async function refreshProducts(){
 const d=await api("/api/admin/studio/products");products=d.products||[];
 $("productCount").textContent=fa(products.length);$("featuredCount").textContent=fa(products.filter(p=>p.featured).length);renderProducts();
}
async function persistProductOrder(ids){
 await api("/api/admin/studio/products/order",{method:"PUT",json:{ids}});
 await refreshProducts();note("اولویت محصولات ذخیره شد.");
}
async function moveProduct(id,dir){
 if($("searchProducts").value.trim())return;
 const ids=orderedProducts().map(p=>p.id),i=ids.indexOf(id),j=i+dir;if(i<0||j<0||j>=ids.length)return;
 [ids[i],ids[j]]=[ids[j],ids[i]];
 try{await persistProductOrder(ids);}catch(e){note(e.message,true);}
}
async function swapProduct(from,to){
 const ids=orderedProducts().map(p=>p.id),i=ids.indexOf(from),j=ids.indexOf(to);
 if(i<0||j<0)return;[ids[i],ids[j]]=[ids[j],ids[i]];await persistProductOrder(ids);
}
$("searchProducts").addEventListener("input",renderProducts);
$("productForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!selectedProduct)return;
 const btn=$("saveProduct");btn.disabled=true;
 try{
  const ids=[...$("productCategories").querySelectorAll("input:checked")].map(x=>x.value);
  if(!ids.length)throw Error("حداقل یک دسته برای محصول انتخاب کن.");
  const p=products.find(x=>x.id===selectedProduct);
  await api("/api/admin/studio/products/"+selectedProduct,{method:"PATCH",json:{categoryIds:ids,featured:$("productFeatured").checked,sortOrder:p.sortOrder}});
  await refreshProducts();note("تنظیمات محصول ذخیره شد.");
 }catch(err){note(err.message,true);}finally{btn.disabled=false;}
});
function renderLayout(){
 const list=$("layoutList");list.replaceChildren();
 for(let i=0;i<sections.length;i++){
  const section=sections[i],{row,content,action}=rowBase();row.classList.add("section-row");
  const title=document.createElement("span");title.className="row-title";title.textContent=section.name;
  const status=document.createElement("span");status.className="row-meta";status.textContent=section.visible?"نمایش در فروشگاه":"پنهان";
  content.append(title,status);
  const toggle=document.createElement("label");toggle.className="check";toggle.title="نمایش این بخش";
  const check=document.createElement("input");check.type="checkbox";check.checked=section.visible;
  check.onchange=()=>{section.visible=check.checked;renderLayout();};
  toggle.append(check);
  action.append(toggle,makeButton("↑","بالا",()=>moveLayout(i,-1),i===0),makeButton("↓","پایین",()=>moveLayout(i,1),i===sections.length-1));
  allowDrop(row,"layout",section.id,async(from,to)=>{const a=sections.findIndex(x=>x.id===from),b=sections.findIndex(x=>x.id===to);if(a>=0&&b>=0){[sections[a],sections[b]]=[sections[b],sections[a]];renderLayout();}});
  list.append(row);
 }
}
function moveLayout(i,delta){const j=i+delta;if(j<0||j>=sections.length)return;[sections[i],sections[j]]=[sections[j],sections[i]];renderLayout();}
$("saveLayout").onclick=async()=>{
 const btn=$("saveLayout");btn.disabled=true;
 try{await api("/api/admin/studio/layout",{method:"PUT",json:{sections:sections.map(s=>({id:s.id,visible:s.visible}))}});note("چیدمان صفحه اصلی منتشر شد.");}
 catch(err){note(err.message,true);}finally{btn.disabled=false;}
};
function showTab(value){
 tab=value;
 document.querySelectorAll("[data-tab]").forEach(b=>{b.classList.toggle("active",b.dataset.tab===value);if(b.dataset.tab===value)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
 for(const id of ["categories","editor","products","homepage"])$("tab-"+id).hidden=id!==value;
}
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));

// --- Full catalog editor (Store Studio v2) ---
let editingCatalogId=null,catalogDetail=null,busyCatalog=false;
const productErrorLabels={
 invalid_product:"نام، قیمت و دسته اصلی محصول را بررسی کن.",
 invalid_variants:"حداقل یک و حداکثر ۳۰ تنوع برای محصول تعریف کن.",
 invalid_variant:"سایز، رنگ و موجودی هر ردیف را تکمیل کن.",
 duplicate_variant:"دو ردیف با سایز و رنگ یکسان وجود دارد.",
 invalid_categories:"دسته‌های انتخاب‌شده معتبر نیستند.",
 invalid_featured:"وضعیت محصول ویژه نامعتبر است.",
 failed_to_save:"ذخیره محصول ممکن نشد؛ صفحه را تازه‌سازی و دوباره تلاش کن.",
 invalid_image_order:"ترتیب عکس‌ها معتبر نیست.",
 image_limit:"حداکثر ۱۰ عکس برای هر محصول مجاز است.",
 image_too_large:"حجم تصویر زیاد است؛ عکس کوچک‌تری انتخاب کن.",
 invalid_image_format:"فقط JPEG، PNG و WebP قابل‌قبول هستند.",
 image_store_not_configured:"فضای ذخیره‌سازی عکس‌ها هنوز تنظیم نشده است."
};
function productError(err){return productErrorLabels[err?.code]||err?.message||"خطای نامشخص";}
function catalogCategoryOptions(primary="",memberships=[]){
 const main=$("itemMainCategory"),box=$("itemCategoryChoices");
 main.replaceChildren();box.replaceChildren();
 const all=tree(),selected=new Set(memberships);
 const legacy=new Set(["women","men","kids","socks","accessories"]);
 for(const c of all){
  if(legacy.has(c.id)){
   const option=document.createElement("option");option.value=c.id;option.textContent=c.name;main.append(option);
  }
  const label=document.createElement("label");label.className="check";
  label.style.paddingInlineStart=Math.min(c.depth,4)*12+"px";
  const cb=document.createElement("input");cb.type="checkbox";cb.value=c.id;cb.checked=selected.has(c.id);cb.className="item-category";
  const text=document.createElement("span");text.textContent=c.name;
  label.append(cb,text);box.append(label);
 }
 if(!all.length){
  const note=document.createElement("p");note.className="hint";
  note.textContent="ابتدا از بخش دسته‌بندی‌ها یک دسته ایجاد کن.";box.append(note);
 }
 main.value=legacy.has(primary)?primary:(main.options[0]?.value||"");
 ensurePrimaryMembership();
}
function ensurePrimaryMembership(){
 const main=$("itemMainCategory").value;
 const checkbox=[...$("itemCategoryChoices").querySelectorAll('input[type="checkbox"]')].find(x=>x.value===main);
 if(checkbox)checkbox.checked=true;
}
$("itemMainCategory").addEventListener("change",ensurePrimaryMembership);
$("itemCategoryChoices").addEventListener("change",e=>{
 if(e.target.matches('input[type="checkbox"]') && e.target.value===$("itemMainCategory").value && !e.target.checked){
  e.target.checked=true;note("دسته اصلی محصول باید فعال بماند.",true);
 }
});
function addCatalogVariant(size="",color="",stock=0){
 const container=$("itemVariants");
 if(container.children.length>=30){note("حداکثر ۳۰ ترکیب سایز و رنگ مجاز است.",true);return;}
 const row=document.createElement("div");row.className="editor-variant";
 const cols=[
  {key:"size",label:"سایز",value:size,max:24,placeholder:"M"},
  {key:"color",label:"رنگ",value:color,max:48,placeholder:"مشکی"},
  {key:"stock",label:"موجودی",value:stock,max:1000000,placeholder:"0"}
 ];
 for(const c of cols){
  const label=document.createElement("label");label.textContent=c.label;
  const input=document.createElement("input");input.dataset.kind=c.key;input.required=true;
  input.placeholder=c.placeholder;input.value=String(c.value);
  if(c.key==="stock"){input.type="number";input.min="0";input.max="1000000";input.step="1";input.inputMode="numeric";}
  else input.maxLength=c.max;
  label.append(input);row.append(label);
 }
 const remove=document.createElement("button");remove.type="button";remove.className="tiny";
 remove.textContent="×";remove.title="حذف تنوع";remove.setAttribute("aria-label","حذف تنوع");
 remove.onclick=()=>{if(container.children.length<=1){note("حداقل یک سایز و رنگ لازم است.",true);return;}row.remove();};
 row.append(remove);container.append(row);
}
function resetCatalogEditor(navigate=false){
 editingCatalogId=null;catalogDetail=null;
 $("catalogEditorForm").reset();$("itemActive").checked=true;$("itemFeatured").checked=false;
 $("catalogEditorTitle").textContent="افزودن محصول جدید";
 catalogCategoryOptions("",[]);
 $("itemVariants").replaceChildren();addCatalogVariant("فری‌سایز","پیش‌فرض",0);
 $("editorImages").replaceChildren();$("imageUploadBlock").hidden=true;
 $("imageHelp").textContent="ابتدا محصول را ذخیره کن تا امکان افزودن تصویر فعال شود.";
 $("uploadProgress").textContent="";$("itemImageFiles").value="";
 if(navigate){showTab("editor");$("catalogEditorTitle").scrollIntoView({behavior:"smooth",block:"start"});}
}
function buildCatalogPayload(){
 const title=$("itemTitle").value.trim(),description=$("itemDescription").value.trim(),
  category=$("itemMainCategory").value;
 const priceText=$("itemPrice").value,oldPrice=$("itemOldPrice").value;
 if(!title||title.length>180)throw Error("نام محصول را کامل وارد کن.");
 const price=Number(priceText);
 if(priceText===""||!Number.isSafeInteger(price)||price<0||price>10000000000)throw Error("قیمت محصول باید عدد معتبر باشد.");
 let compare=null;
 if(oldPrice!==""){
  compare=Number(oldPrice);
  if(!Number.isSafeInteger(compare)||compare<0||compare>10000000000)throw Error("قیمت قبل از تخفیف معتبر نیست.");
 }
 const categoryIds=[...$("itemCategoryChoices").querySelectorAll("input:checked")].map(x=>x.value);
 if(!category||!categoryIds.includes(category)||categoryIds.length>12)throw Error("دسته‌بندی اصلی و حداکثر ۱۲ دسته برای نمایش انتخاب کن.");
 const variants=[...$("itemVariants").children].map(row=>{
  const get=kind=>row.querySelector('[data-kind="'+kind+'"]')?.value.trim()||"";
  const size=get("size"),color=get("color"),rawStock=get("stock"),stock=Number(rawStock);
  if(!size||!color||!rawStock||!Number.isSafeInteger(stock)||stock<0||stock>1000000)throw Error("سایز، رنگ و موجودی را برای هر تنوع درست وارد کن.");
  return {size,color,stock};
 });
 if(!variants.length||variants.length>30)throw Error("تعداد تنوع محصول معتبر نیست.");
 if(new Set(variants.map(x=>JSON.stringify([x.size,x.color]))).size!==variants.length)throw Error("سایز و رنگ تکراری وجود دارد.");
 return {title,description,category,categoryIds,priceToman:price,compareAtToman:compare,
   active:$("itemActive").checked,featured:$("itemFeatured").checked,variants};
}
async function loadCatalogDetail(id,navigate=true){
 const response=await api("/api/admin/studio/product-details/"+id);
 const p=response.product;if(!p)throw Error("محصول پیدا نشد.");
 editingCatalogId=p.id;catalogDetail=p;selectedProduct=p.id;
 $("catalogEditorTitle").textContent="ویرایش: "+p.title;
 $("itemTitle").value=p.title;$("itemDescription").value=p.description||"";
 $("itemPrice").value=p.priceToman;$("itemOldPrice").value=p.compareAtToman??"";
 $("itemActive").checked=p.active;$("itemFeatured").checked=p.featured;
 catalogCategoryOptions(p.category,p.categoryIds||[p.category]);
 $("itemVariants").replaceChildren();
 for(const v of p.variants||[])addCatalogVariant(v.size,v.color,v.stock);
 if(!$("itemVariants").children.length)addCatalogVariant();
 renderEditorImages(p);
 if(navigate){showTab("editor");$("catalogEditorTitle").scrollIntoView({behavior:"smooth",block:"start"});}
}
function renderEditorImages(p){
 const list=$("editorImages");list.replaceChildren();
 $("imageUploadBlock").hidden=false;
 $("imageHelp").textContent="تصاویر محصول ("+fa(p.images.length)+" از ۱۰)";
 if(!p.images?.length){
  const info=document.createElement("p");info.className="hint";info.textContent="هنوز عکسی ثبت نشده است.";list.append(info);return;
 }
 p.images.forEach((img,i)=>{
  const card=document.createElement("div");card.className="editor-photo";
  const picture=document.createElement("img");picture.src=img.url;picture.alt="عکس محصول "+fa(i+1);picture.loading="lazy";
  picture.onerror=()=>{picture.alt="تصویر بارگذاری نشد";};
  const badge=document.createElement("strong");badge.textContent=i===0?"تصویر اصلی":"تصویر "+fa(i+1);
  const actions=document.createElement("div");actions.className="photo-actions";
  const up=makeButton("↑","نمایش زودتر",()=>moveEditorPhoto(i,-1),i===0);
  const down=makeButton("↓","نمایش دیرتر",()=>moveEditorPhoto(i,1),i===p.images.length-1);
  const remove=makeButton("×","حذف تصویر",()=>deleteEditorPhoto(img.id));
  remove.style.color="#a94b65";
  actions.append(up,down,remove);card.append(picture,badge,actions);list.append(card);
 });
}
async function moveEditorPhoto(index,offset){
 if(!catalogDetail||busyCatalog)return;
 const next=[...catalogDetail.images];const j=index+offset;
 if(j<0||j>=next.length)return;
 [next[index],next[j]]=[next[j],next[index]];
 busyCatalog=true;
 try{
  await api("/api/admin/products/"+editingCatalogId+"/images/order",{method:"PUT",json:{ids:next.map(x=>x.id)}});
  await loadCatalogDetail(editingCatalogId,false);note("ترتیب عکس‌ها ذخیره شد.");
 }catch(err){note(productError(err),true);}finally{busyCatalog=false;}
}
async function deleteEditorPhoto(id){
 if(!editingCatalogId||busyCatalog||!confirm("این تصویر از فروشگاه حذف شود؟"))return;
 busyCatalog=true;
 try{
  await api("/api/admin/images/"+id,{method:"DELETE"});
  await loadCatalogDetail(editingCatalogId,false);note("تصویر حذف شد.");
 }catch(err){note(productError(err),true);}finally{busyCatalog=false;}
}
async function optimizeCatalogImage(file){
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("فرمت تصویر باید JPEG، PNG یا WebP باشد.");
 if(file.size>18_000_000)throw Error("برای آپلود، تصویر کمتر از ۱۸ مگابایت انتخاب کن.");
 const bitmap=await createImageBitmap(file);
 try{
  const maxSide=1080,scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  if(!Number.isFinite(scale)||scale<=0)throw Error("ابعاد عکس نامعتبر است.");
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [.8,.67,.52,.4,.3]){
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
   if(blob && blob.type==="image/webp" && blob.size>100 && blob.size<620000)return blob;
  }
  throw Error("فشرده‌سازی کافی نبود؛ تصویری با ابعاد کوچک‌تر انتخاب کن.");
 }finally{bitmap.close?.();}
}
$("catalogEditorForm").addEventListener("submit",async e=>{
 e.preventDefault();if(busyCatalog)return;
 const button=$("saveCatalogItem");busyCatalog=true;button.disabled=true;
 try{
  const payload=buildCatalogPayload();
  const id=editingCatalogId,method=id?"PUT":"POST",path="/api/admin/products"+(id?"/"+id:"");
  const result=await api(path,{method,json:payload});
  const target=result.id||id;
  await refreshProducts();
  await loadCatalogDetail(target,false);
  note(id?"تغییرات محصول ذخیره شد.":"محصول جدید ذخیره شد؛ اکنون می‌توانی عکس‌هایش را آپلود کنی.");
 }catch(err){note(productError(err),true);}
 finally{busyCatalog=false;button.disabled=false;}
});
$("uploadItemImages").addEventListener("click",async()=>{
 const files=[...($("itemImageFiles").files||[])];
 if(!editingCatalogId){note("ابتدا محصول را ذخیره کن.",true);return;}
 if(!files.length){note("یک یا چند تصویر انتخاب کن.",true);return;}
 if(files.length+catalogDetail.images.length>10){note("برای هر محصول حداکثر ۱۰ تصویر مجاز است.",true);return;}
 if(busyCatalog)return;
 busyCatalog=true;$("uploadItemImages").disabled=true;
 let done=0;
 try{
  for(const file of files){
   $("uploadProgress").textContent="در حال پردازش عکس "+fa(done+1)+" از "+fa(files.length)+"…";
   const blob=await optimizeCatalogImage(file);
   const response=await fetch("/api/admin/products/"+editingCatalogId+"/images",{
    method:"POST",headers:{"content-type":"image/webp","x-csrf-token":csrf},
    body:blob,credentials:"same-origin",cache:"no-store"
   });
   const result=await response.json().catch(()=>({error:"invalid_response"}));
   if(!response.ok){const err=new Error(productErrorLabels[result.error]||"آپلود تصویر موفق نبود.");err.code=result.error;throw err;}
   done++;
  }
  $("itemImageFiles").value="";
  await loadCatalogDetail(editingCatalogId,false);
  note(fa(done)+" تصویر با موفقیت ذخیره شد.");
 }catch(err){
  if(done)await loadCatalogDetail(editingCatalogId,false);
  note("آپلود "+fa(done)+" تصویر انجام شد؛ "+productError(err),true);
 }finally{
  $("uploadProgress").textContent="";
  busyCatalog=false;$("uploadItemImages").disabled=false;
 }
});
$("addItemVariant").onclick=()=>addCatalogVariant("","",0);
$("newCatalogItem").onclick=()=>resetCatalogEditor(true);
$("resetCatalogItem").onclick=()=>resetCatalogEditor(false);
$("newFromRanking").onclick=()=>resetCatalogEditor(true);
$("editFullProduct").onclick=()=>{if(selectedProduct)loadCatalogDetail(selectedProduct).catch(e=>note(productError(e),true));};

$("loginForm").onsubmit=async e=>{
 e.preventDefault();const btn=$("loginButton");btn.disabled=true;
 try{
  await api("/api/admin/login",{method:"POST",json:{password:$("password").value}});
  $("password").value="";const me=await api("/api/admin/me");csrf=me.csrf;
  showWorkspace();try{await loadAll();$("setupWarning").hidden=true;note("ورود با موفقیت انجام شد.");}catch(err){$("setupWarning").hidden=err.code!=="migration_required";note(err.message,true);}
 }catch(err){note(err.message,true);}finally{btn.disabled=false;}
};
$("logout").onclick=async()=>{try{await api("/api/admin/logout",{method:"POST"});}catch{}showLogin();};
(async()=>{
 try{const me=await api("/api/admin/me");csrf=me.csrf;showWorkspace();try{await loadAll();$("setupWarning").hidden=true;}catch(err){$("setupWarning").hidden=err.code!=="migration_required";note(err.message,true);}}
 catch(error){showLogin();}
})();
})();