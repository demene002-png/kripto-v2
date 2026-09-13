export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ok:true,version:'0.1.3',mode:'PAPER',service:'kripto-v2'});
}
