import {supabaseTransport} from '../server/native-http.mjs';
export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  try{return res.status(200).json({ok:true,version:'0.1.7',mode:'PAPER',service:'kripto-v2',supabaseTransport:supabaseTransport()});}
  catch{return res.status(503).json({ok:false,version:'0.1.7',error:'Supabase bağlantı yöntemi ayarı geçersiz.'});}
}
