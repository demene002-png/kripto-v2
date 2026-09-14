import {config,userId,account,withAccount,select,rpc} from '../server/db.mjs';
import {validateSettings,equity,liquidationPrice,grossPnl} from '../core/engine.mjs';
import {tick,closeManual} from '../server/runner.mjs';
import {historyQuery,historyPage} from '../server/history.mjs';
function publicState(state){return {...state,equity:equity(state),positions:state.positions.map(p=>({...p,liquidation:liquidationPrice(p),net: grossPnl(p,p.mark)-p.entryFee-p.qty*p.mark*p.feeRate+p.funding}))};}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  try {
    if(req.method==='GET'&&req.query?.config==='1'){const c=config();return res.status(200).json({url:c.url,key:c.key,version:'0.1.8'});}
    const uid=await userId(req);
    if(req.method==='GET') {
      const cursor=req.query?.before;
      if(req.query?.history==='1') {
        const rows=await select('kv2_events',historyQuery(uid,cursor));return res.status(200).json(historyPage(rows));
      }
      let a=await account(uid);if(!a)a=await withAccount(uid,()=>{});
      const research=await select('kv2_research',`user_id=eq.${uid}&select=id,created_at,result&order=created_at.desc&limit=3`);
      return res.status(200).json({state:publicState(a.state),revision:a.revision,research});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Bu yöntem desteklenmiyor.'});
    const b=req.body||{};
    const result=await withAccount(uid,async(a,revision)=>{
      if(b.action==='settings') {
        if(b.settingsVersion!==(a.settingsVersion||0))throw Error('Ayarlar başka bir oturumda değişti. Güncel ayarları yükleyip tekrar kaydedin.');
        a.settings=validateSettings(a.settings,b.settings);a.settingsVersion=(a.settingsVersion||0)+1;return;
      }
      if(b.action==='scan')return tick(a);
      if(b.action==='close'){if(typeof b.id!=='string')throw Error('Pozisyon seçin.');return closeManual(a,b.id);}
      if(b.action==='pause'){a.settings.paused=true;a.settingsVersion=(a.settingsVersion||0)+1;return;}
      throw Error('Geçersiz işlem.');
    });
    return res.status(200).json({...result,state:publicState(result.state)});
  }catch(e){return res.status(400).json({error:e.message});}
}
