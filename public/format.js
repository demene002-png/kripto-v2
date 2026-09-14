// Price precision adapts to magnitude; money amounts keep their separate format.
const priceFormatter=new Intl.NumberFormat('tr-TR',{maximumSignificantDigits:12});
export function formatPrice(value){
  if(value===null||value===undefined||value==='')return '—';
  const number=Number(value);
  return Number.isFinite(number)&&number>0?priceFormatter.format(number):'—';
}
