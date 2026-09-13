import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import app from '../api/v2-app.js';import cron from '../api/v2-cron.js';import research from '../api/v2-research.js';import health from '../api/health.js';
const routes={'/api/app':app,'/api/cron':cron,'/api/research':research,'/api/v2-app':app,'/api/v2-cron':cron,'/api/v2-research':research,'/api/health':health};const publicRoot=resolve('public');
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');req.query=Object.fromEntries(url.searchParams);
    res.status=n=>{res.statusCode=n;return res;};res.json=x=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(x));};
    if(routes[url.pathname]){let text='';for await(const chunk of req){text+=chunk;if(text.length>20000)throw Error('İstek çok büyük.');}req.body=text?JSON.parse(text):{};return routes[url.pathname](req,res);}
    const path=resolve(publicRoot,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if(!path.startsWith(publicRoot+'/')){res.statusCode=403;return res.end();}
    const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
    res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));
  }catch{res.statusCode=404;res.end('Sayfa bulunamadı.');}
}).listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Kripto V2: http://localhost:3000'));
