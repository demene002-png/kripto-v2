import {timingSafeEqual} from 'node:crypto';
import {select,withAccount} from '../server/db.mjs';
import {tick} from '../server/runner.mjs';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  const secret=process.env.CRON_SECRET||'',expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(req.headers.authorization||'');
  if(secret.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'Yetkisiz zamanlayıcı.'});
  try {
    // Bounded work: one account each invocation, oldest account first.
    const rows=await select('kv2_accounts','select=user_id&order=updated_at.asc&limit=1');
    if(!rows.length)return res.status(200).json({ok:true,message:'Henüz hesap yok.'});
    const r=await withAccount(rows[0].user_id,tick);
    return res.status(r.output?.skipped?200:r.state.lastError?503:200).json({ok:r.output?.skipped?true:!r.state.lastError,skipped:!!r.output?.skipped,nextCheckAt:r.state.nextScanAt,message:r.state.lastError||r.state.status});
  }catch(e){return res.status(503).json({error:e.message});}
}
