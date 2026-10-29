/* Iranian card issuer identification from public BIN/IIN prefixes.
   Source references (prefix lists, not bank verification):
   https://github.com/dashti011/IRBankNameCardNumber
   https://github.com/amirhossein7/iran-bankit
   This only identifies a likely issuer, NOT card ownership, validity or payment.
   Some historical issuer names reflect cards migrated to other institutions. */
(function(global){
  "use strict";
  const prefix8=Object.freeze({
    "62198618":"بلوبانک (زیرمجموعه بانک سامان)"
  });
  const prefix6=Object.freeze({
    "603799":"بانک ملی ایران",
    "603769":"بانک صادرات ایران",
    "603770":"بانک کشاورزی",
    "589210":"بانک سپه",
    "610433":"بانک ملت",
    "991975":"بانک ملت",
    "628023":"بانک مسکن",
    "627648":"بانک توسعه صادرات ایران",
    "207177":"بانک توسعه صادرات ایران",
    "627961":"بانک صنعت و معدن",
    "627353":"بانک تجارت",
    "589463":"بانک رفاه کارگران",
    "502229":"بانک پاسارگاد",
    "639347":"بانک پاسارگاد",
    "627412":"بانک اقتصاد نوین",
    "622106":"بانک پارسیان",
    "639194":"بانک پارسیان",
    "627884":"بانک پارسیان",
    "627488":"بانک کارآفرین",
    "502910":"بانک کارآفرین",
    "621986":"بانک سامان",
    "639346":"بانک سینا",
    "639607":"بانک سرمایه",
    "502806":"بانک شهر",
    "504706":"بانک شهر",
    "502938":"بانک دی",
    "505785":"بانک ایران زمین",
    "502908":"بانک توسعه تعاون",
    "627760":"پست بانک ایران",
    "606373":"بانک قرض‌الحسنه مهر ایران",
    "504172":"بانک قرض‌الحسنه رسالت",
    "505809":"بانک خاورمیانه",
    "505416":"بانک گردشگری",
    "606256":"مؤسسه اعتباری ملل",
    "636795":"بانک مرکزی",
    "636214":"بانک آینده (سابق؛ انتقال به بانک ملی)",
    "627381":"بانک انصار (سابق؛ ادغام در بانک سپه)",
    "639599":"بانک قوامین (سابق؛ ادغام در بانک سپه)",
    "636949":"بانک حکمت ایرانیان (سابق؛ ادغام در بانک سپه)",
    "639370":"بانک مهر اقتصاد (سابق؛ ادغام در بانک سپه)",
    "606737":"بانک مهر اقتصاد (سابق؛ ادغام در بانک سپه)",
    "505801":"مؤسسه کوثر (سابق؛ ادغام در بانک سپه)"
  });
  const normalize = value => String(value??"")
    .replace(/[۰-۹]/g,c=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g,c=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[\s-]/g,"");
  function identify(value){
    const n=normalize(value);
    if(n.length<6||!/^[0-9]+$/.test(n)) return null;
    const eight=n.slice(0,8),six=n.slice(0,6);
    if(n.length>=8 && prefix8[eight]) return {name:prefix8[eight],prefix:eight};
    if(prefix6[six]) return {name:prefix6[six],prefix:six};
    return null;
  }
  function format(value){
    const n=normalize(value);
    return /^\d{16}$/.test(n)?n.replace(/(\d{4})(?=\d)/g,"$1 "):n;
  }
  global.ZebarBank=Object.freeze({normalize,identify,format});
})(globalThis);
