import {eligible} from '../core/engine.mjs';
const BASE='https://fapi.binance.com';
const ALLOWED=new Set(['/fapi/v1/exchangeInfo','/fapi/v1/ticker/24hr','/fapi/v1/ticker/bookTicker','/fapi/v1/premiumIndex','/fapi/v1/klines','/fapi/v1/markPriceKlines','/fapi/v1/fundingRate']);
export async function publicGet(path,params={},fetcher=fetch) {
  if(!ALLOWED.has(path))throw Error('Bu Binance yolu izinli değil.');
  const response=await fetcher(`${BASE}${path}?${new URLSearchParams(params)}`,{method:'GET',signal:AbortSignal.timeout(4000)});
  if(!response.ok)throw Error(`Binance verisi alınamadı (${response.status}). İşlem açılmadı.`);
  const data=await response.json();if(data?.code<0)throw Error('Binance veri hatası.');return data;
}
export async function universe(settings) {
  const [info,tickers]=await Promise.all([publicGet('/fapi/v1/exchangeInfo'),publicGet('/fapi/v1/ticker/24hr')]);
  if(!Array.isArray(info.symbols)||!Array.isArray(tickers))throw Error('Piyasa veri biçimi geçersiz.');
  const tm=new Map(tickers.map(t=>[t.symbol,t]));
  return info.symbols.filter(s=>eligible(s)&&Date.now()-s.onboardDate>30*86400000).map(s=>({...s,volume:Number(tm.get(s.symbol)?.quoteVolume||0),change:Number(tm.get(s.symbol)?.priceChangePercent||0)})).filter(s=>s.volume>=settings.minVolume).sort((a,b)=>b.volume-a.volume).slice(0,50);
}
export function parseCandles(raw,now=Date.now()) {
  if(!Array.isArray(raw))throw Error('Mum verisi bir liste değil.');
  const rows=raw.filter(r=>Number(r[6])<now).map(r=>({t:Number(r[0]),o:Number(r[1]),h:Number(r[2]),l:Number(r[3]),c:Number(r[4]),v:Number(r[5]),end:Number(r[6])}));
  if(rows.some((r,i)=>![r.t,r.o,r.h,r.l,r.c,r.v,r.end].every(Number.isFinite)||Math.min(r.o,r.h,r.l,r.c)<=0||r.h<Math.max(r.o,r.c)||r.l>Math.min(r.o,r.c)||r.v<0||(i&&r.t<=rows[i-1].t)))throw Error('Mum değerleri geçersiz.');
  return rows;
}
export async function candles(symbol,limit=160,interval='15m',mark=false,endTime=null) {
  const params={symbol,interval,limit:String(limit)};if(endTime)params.endTime=String(endTime);
  return parseCandles(await publicGet(mark?'/fapi/v1/markPriceKlines':'/fapi/v1/klines',params));
}
export async function quote(symbol) {
  const [m,b]=await Promise.all([publicGet('/fapi/v1/premiumIndex',{symbol}),publicGet('/fapi/v1/ticker/bookTicker',{symbol})]);
  const q={mark:Number(m.markPrice),bid:Number(b.bidPrice),ask:Number(b.askPrice),time:Number(m.time),fundingRate:Number(m.lastFundingRate),nextFunding:Number(m.nextFundingTime)};
  if(m.symbol!==symbol||b.symbol!==symbol||![q.mark,q.bid,q.ask,q.time,q.fundingRate,q.nextFunding].every(Number.isFinite)||Math.min(q.mark,q.bid,q.ask)<=0||q.bid>q.ask||Math.abs(Date.now()-q.time)>15000||Math.abs(Date.now()-Number(b.time))>15000)throw Error('Güncel fiyat doğrulanamadı.');
  return q;
}
export async function funding(symbol,startTime,endTime) {
  const data=await publicGet('/fapi/v1/fundingRate',{symbol,startTime:String(startTime),endTime:String(endTime),limit:'1000'});
  if(!Array.isArray(data)||data.length===1000)throw Error('Fonlama geçmişi eksik veya çok uzun.');
  const out=data.map(r=>({time:Number(r.fundingTime),rate:Number(r.fundingRate),mark:Number(r.markPrice)}));
  if(out.some(r=>![r.time,r.rate,r.mark].every(Number.isFinite)||r.mark<=0))throw Error('Fonlama verisi geçersiz.');return out;
}
