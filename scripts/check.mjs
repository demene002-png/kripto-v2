import {readdir,readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
for(const dir of ['core','server','api','public','scripts'])for(const p of await walk(dir)){if(!/\.(mjs|js)$/.test(p))continue;const r=spawnSync(process.execPath,['--check',p],{stdio:'inherit'});if(r.status)process.exit(r.status);}
JSON.parse(await readFile('vercel.json','utf8'));console.log('V2 kaynak sözdizimi ve yapılandırma kontrolü başarılı. Statik çıktı: public/');
