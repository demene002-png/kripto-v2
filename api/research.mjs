import {userId,account,rpc} from '../server/db.mjs';
import {candles,funding,universe} from '../server/market.mjs';
import {laboratory} from '../core/research.mjs';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  try {
    const uid=await userId(req),a=await account(uid);if(!a)throw Error('Önce hesabı açın.');
    const symbol=String(req.body?.symbol||'BTCUSDT').toUpperCase();if(!/^[A-Z0-9]{2,20}USDT$/.test(symbol))throw Error('Geçersiz sembol.');
    const list=await universe(a.state.settings),meta=list.find(x=>x.symbol===symbol);if(!meta)throw Error('Bu coin güncel kalite evreninde yok.');
    const end=Date.now();const [rows,marks]=await Promise.all([candles(symbol,1000,'15m',false,end),candles(symbol,1000,'15m',true,end)]);
    const rates=await funding(symbol,rows[0].t,rows.at(-1).end);
    const result=laboratory(rows,marks,rates,a.state.settings,meta);
    const id=await rpc('kv2_save_research',{p_user:uid,p_result:result});
    return res.status(200).json({id,result});
  }catch(e){return res.status(400).json({error:e.message});}
}
