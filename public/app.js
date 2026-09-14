import {readJson,publicConfig} from './http.js';
import {pageMayCheck,nextCheckAt} from './automation.js';
import {formatPrice} from './format.js';
import {TradeHistory} from './history.js';
const $=s=>document.querySelector(s), fmt=(x,d=2)=>Number(x).toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d});
const money=x=>`${fmt(x)} USDT`,date=x=>new Date(x).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const color=x=>Number(x)>=0?'green':'red',sign=x=>`${x>0?'+':''}${fmt(x)}`;
const names={YUKSELIS:'Yükseliş',DUSUS:'Düşüş',YATAY:'Yatay',ASIRI_OYNAK:'Aşırı oynak',TASFIYE:'Sanal tasfiye',ZARAR_DURDUR:'Zararı durdur',KAR_KORUMA:'Kâr koruma',KAR_AL:'Kâr al',MANUEL:'Manuel kapatma',TEST_SONU:'Test sonu',BEKLE:'Bekle',GERI_CEKILME:'Giriş fiyatı bekleniyor',IPTAL:'Fırsat iptal edildi',UYGUN:'Koşullar uygun',ACILDI:'Pozisyon açıldı',trend:'Eğilim',momentum:'İvme',breakout:'Kırılım',pullback:'Geri çekilme'};
let cfg,session,state,revision,dirty=false,settingsRevision,busy=false;
const history=new TradeHistory();
let cycling=false,lastAutoAttempt=0;
const preview=new URLSearchParams(location.search).get('preview')==='1';
const fields=[['auto','Otomatik işlem','bool'],['paused','Yeni işlemleri duraklat','bool'],['leverage','Kaldıraç (1x–50x)',1,50,1],['riskPct','İşlem başına risk (%)',.1,2,.1],['dailyLossPct','Günlük zarar sınırı (%)',.5,10,.5],['maxDrawdownPct','Azami sermaye düşüşü (%)',1,30,1],['maxOpenRiskPct','Toplam açık risk (%)',.5,5,.5],['maxMarginPct','Pozisyon teminat sınırı (%)',1,30,1],['maxPositions','En fazla açık pozisyon',1,5,1],['minScore','En düşük fırsat puanı',80,100,1],['minVotes','Gerekli strateji oyu',2,4,1],['atrMult','ATR stop çarpanı',1,4,.1],['rewardRisk','Hedef / risk oranı',1.5,4,.1],['cooldownMinutes','Coin bekleme süresi (dk)',15,1440,15],['slippageBps','Fiyat kayması (baz puan)',1,50,1],['feeRate','Tek yön komisyon oranı',.0001,.003,.0001],['maintenanceRate','Sanal bakım teminatı oranı',.01,.05,.001],['maxSpreadBps','En yüksek alış-satış farkı (bp)',1,20,1],['minVolume','En düşük 24 saat hacmi (USDT)',10000000,1000000000,1000000]];
function notice(text){$('#message').textContent=text;$('#message').classList.toggle('hidden',!text);}
function saveSession(s){session=s;sessionStorage.setItem('kv2-session',JSON.stringify(s));}
async function loadConfig(){const r=await fetch('/api/v2-app?config=1',{cache:'no-store'});cfg=publicConfig(await readJson(r,'Uygulama bağlantısı'));return cfg;}
async function auth(path,body){if(!cfg)await loadConfig();const r=await fetch(cfg.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify(body)});return readJson(r,'Supabase giriş bağlantısı');}
async function api(path='/api/v2-app',body) {
  if(preview)throw Error('Önizlemede işlem yapılmaz.');
  if(session?.expires_at&&session.expires_at*1000<Date.now()+60000){saveSession(await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}));}
  const r=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},...(body?{body:JSON.stringify(body)}:{})});
  return readJson(r,'Uygulama bağlantısı');
}
function chart(points){const svg=$('#equity-chart');svg.replaceChildren();if(points.length<2)return;const values=points.map(p=>p.equity),lo=Math.min(...values),range=Math.max(1,Math.max(...values)-lo),coords=values.map((v,i)=>`${i/(values.length-1)*480},${100-(v-lo)/range*90}`).join(' ');const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('points',coords);line.setAttribute('fill','none');line.setAttribute('stroke','#80ecc2');line.setAttribute('stroke-width','2');svg.append(line);$('#curve-caption').textContent=`${points.length} hesap gözlemi`;}
function renderSettings(){
  if(dirty)return;settingsRevision=state.settingsVersion||0;
  const basic=new Set(['auto','leverage','maxPositions']);
  const labels={auto:'Otomatik işlem',leverage:'Kaldıraç',maxPositions:'Aynı anda açık işlem'};
  const hints={auto:'Uygun fırsatlarda sanal işlem açar.',leverage:'1x–50x arasında; risk kontrolüne bağlı.',maxPositions:'Aynı anda kaç işlem açık kalabilir?'};
  const field=([key,label,min,max,step])=>`<label>${escape(labels[key]||label)}${min==='bool'?`<select name="${key}"><option value="false" ${state.settings[key]?'':'selected'}>Kapalı</option><option value="true" ${state.settings[key]?'selected':''}>Açık</option></select>`:`<input type="number" name="${key}" min="${min}" max="${max}" step="${step}" required value="${state.settings[key]}">`}${hints[key]?`<small>${hints[key]}</small>`:''}</label>`;
  $('#settings-fields').innerHTML=fields.filter(f=>basic.has(f[0])).map(field).join('');
  $('#advanced-fields').innerHTML=fields.filter(f=>!basic.has(f[0])).map(field).join('');
  $('#risk-summary').textContent=`Kayıtlı risk sınırları: işlem başına %${fmt(state.settings.riskPct,1)} · günlük zarar %${fmt(state.settings.dailyLossPct,1)}${state.settings.paused?' · Yeni işlemler duraklatılmış':''}`;
}
function render(){
  $('#dashboard').classList.remove('hidden');$('#login').classList.add('hidden');
  $('#equity').textContent=fmt(state.equity);$('#total-return').textContent=`${sign(state.equity-1000)} USDT · %${sign((state.equity/1000-1)*100)}`;$('#total-return').className=color(state.equity-1000);
  $('#balance').textContent=money(state.balance);$('#margin').textContent=money(state.positions.reduce((s,p)=>s+p.margin,0));const unrealized=state.positions.reduce((s,p)=>s+p.net,0);$('#unrealized').textContent=money(unrealized);$('#unrealized').className=color(unrealized);
  $('#drawdown').textContent=`%${fmt((state.peak-state.equity)/state.peak*100)}`;$('#dd-limit').textContent=`Durdurma sınırı: %${state.settings.maxDrawdownPct}`;
  $('#leverage').textContent=`${state.settings.leverage}x / en fazla 50x`;$('#risk').textContent=`%${state.settings.riskPct}`;$('#daily-loss').textContent=`%${state.settings.dailyLossPct}`;$('#regime').textContent=names[state.regime]||'Bekleniyor';
  const stale=!state.lastRun||Date.now()>Math.max(state.lastRun+120000,(state.nextScanAt||0)+60000),problem=stale||state.lastError||state.circuit;
  $('#health-dot').className=problem?'amber-dot':'green-dot';$('#health').textContent=state.circuit|| (stale?'Otomasyon bekleniyor / gecikmiş':state.lastError?'Veri kontrolü gerekiyor':state.settings.paused?'Yeni işlemler duraklatıldı':state.settings.auto?'Otomatik sanal işlem açık':'Yalnız tarama · otomatik işlem kapalı');
  $('#run-detail').textContent=[state.lastRun?`Son tur: ${date(state.lastRun)}`:'Henüz tarama yok',state.lastError||state.status||''].join(' · ');
  const wait=Math.max(0,Math.ceil((nextCheckAt(state)-Date.now())/1000));
  $('#auto-detail').textContent=preview?'Önizlemede otomatik kontrol yapılmaz.':`Sayfa açıkken otomatik kontrol · ${wait?`Sonraki kontrol yaklaşık ${wait} sn sonra`:'Kontrol sırası geldi'} · Sayfa kapalıyken Supabase zamanlayıcısı gerekir.`;
  chart(state.curve);$('#position-count').textContent=state.positions.length;$('#positions-empty').classList.toggle('hidden',!!state.positions.length);
  $('#position-rows').innerHTML=state.positions.map(p=>`<tr><td><b>${escape(p.symbol)}</b><small class="${p.side===1?'green':'red'}">${p.side===1?'Yükseliş':'Düşüş'} · ${p.leverage}x</small></td><td>${fmt(p.margin)}<small>${fmt(p.qty*p.entry)} USDT büyüklük</small></td><td>${formatPrice(p.entry)}<small>${formatPrice(p.mark)} · ${date(p.markTime)}</small></td><td>${formatPrice(p.stop)}<small>${formatPrice(p.target)}${p.protectionStage?` · <span class="green">${p.protectionStage==='KAR_KILITLI'?'Kâr kilitli':'En az 0,25 risk kârı'}</span>`:''}</small></td><td>${formatPrice(p.liquidation)}<small>Yaklaşık model</small></td><td class="${color(p.net)}">${sign(p.net)}</td><td><button class="secondary close-position" data-id="${escape(p.id)}">Pozisyonu kapat</button></td></tr>`).join('');
  $('#signal-rows').innerHTML=state.signals.slice(-12).reverse().map(s=>`<tr><td>${date(s.time)}</td><td><b>${escape(s.symbol)}</b></td><td class="${s.side===1?'green':'red'}">${s.side===1?'Yükseliş':'Düşüş'}</td><td>${s.score}</td><td>${s.count} / 4</td><td>${names[s.action]||escape(s.action)}<small>${escape(s.reasons.join(' · ')||'Kontrollerden geçti')}</small></td></tr>`).join('');$('#signals-empty').classList.toggle('hidden',!!state.signals.length);
  history.merge(state.trades.slice(-20));renderHistory();renderSettings();
}
function renderHistory(){const unique=history.rows;$('#history-rows').innerHTML=unique.map(t=>`<tr><td>${date(t.closedAt)}</td><td><b>${escape(t.symbol)}</b><small>${t.side===1?'Yükseliş':'Düşüş'}</small></td><td>${t.leverage}x</td><td>${sign(t.gross)}</td><td>${fmt(t.fees,4)}</td><td class="${color(t.funding)}">${sign(t.funding)}</td><td class="${color(t.net)}"><b>${sign(t.net)}</b>${t.adjustment>0?'<small>İzole zarar sınırı uygulandı</small>':''}</td><td>${names[t.reason]||escape(t.reason)}</td></tr>`).join('');$('#history-empty').classList.toggle('hidden',!!unique.length);
  const button=$('#history-more');button.disabled=history.loading||(history.loaded&&!history.hasMore);
  button.textContent=history.loading?'Yükleniyor…':history.error?'Tekrar dene':history.loaded&&!history.hasMore?'Tüm kayıtlar yüklendi':history.loaded?'Daha eski işlemler':'Geçmişi yükle';
  $('#history-status').textContent=history.error?`Geçmiş yüklenemedi: ${history.error}`:history.loading?'Kapanan işlemler yükleniyor…':`${unique.length} kapanan işlem gösteriliyor.${history.loaded&&!history.hasMore?' Kayıtlı daha eski işlem yok.':''}`;
}
async function loadHistory(){const pending=history.load(api);renderHistory();await pending;renderHistory();} 
function renderResearch(r){const comparison=r.exitComparison?`<h3>Kâr koruma karşılaştırması</h3><div class="research-stats"><div><small>Kâr korumalı net sonuç</small><strong class="${color(r.exitComparison.protected.net)}">${sign(r.exitComparison.protected.net)}</strong></div><div><small>Sabit stop ve hedef</small><strong class="${color(r.exitComparison.static.net)}">${sign(r.exitComparison.static.net)}</strong></div><div><small>Korumalı başarı oranı</small><strong>%${fmt(r.exitComparison.protected.winRate)}</strong></div><div><small>Sabit başarı oranı</small><strong>%${fmt(r.exitComparison.static.winRate)}</strong></div></div>`:'';$('#research-result').innerHTML=`<h3>${escape(r.symbol)} · ${r.candleCount} mum · ${date(r.from)}–${date(r.to)}</h3><div class="research-stats"><div><small>Net sonuç</small><strong class="${color(r.baseline.net)}">${sign(r.baseline.net)}</strong></div><div><small>İşlem sayısı</small><strong>${r.baseline.trades}</strong></div><div><small>En büyük düşüş</small><strong>%${fmt(r.baseline.maxDrawdownPct)}</strong></div><div><small>Toplam komisyon</small><strong>${fmt(r.baseline.fees)}</strong></div></div>${comparison}<h3>İleri yürüyen doğrulama</h3><div class="table-wrap"><table><thead><tr><th>Pencere</th><th>Seçilen ATR / hedef oranı</th><th>Test işlemi</th><th>Test net sonucu</th><th>Örneklem</th></tr></thead><tbody>${r.folds.map((f,i)=>`<tr><td>${i+1} · ${date(f.testStart)}</td><td>${f.parameters.atrMult} / ${f.parameters.rewardRisk}</td><td>${f.validation.trades}</td><td class="${color(f.validation.net)}">${sign(f.validation.net)}</td><td>${f.sampleAdequate?'Eğitimde en az 5 işlem':'Eğitim yetersiz; mevcut ayarlar kullanıldı'}</td></tr>`).join('')}</tbody></table></div><h3>Strateji çıkarma analizi</h3><p class="fine">Pozitif katkı: strateji varken toplam sonuç daha iyi. Bu karşılaştırmalar toplanamaz.</p><div class="research-stats">${r.contribution.map(c=>`<div><small>${names[c.strategy]}</small><strong class="${color(c.contribution)}">${sign(c.contribution)}</strong></div>`).join('')}</div><ul class="research-notes">${r.limitations.map(n=>`<li>${escape(n)}</li>`).join('')}</ul>`;}
async function refresh(){const r=await api();if(revision!==undefined&&r.revision<revision)return;state=r.state;revision=r.revision;render();if(!history.attempted&&!preview)void loadHistory();if(r.research?.[0])renderResearch(r.research[0].result);}
async function backgroundCycle(){
  if(cycling||busy||preview||!session||document.hidden)return;
  cycling=true;let ownsBusy=false;
  try {
    await refresh();
    if(!pageMayCheck({state,authenticated:!!session,preview,visible:!document.hidden,busy,lastAttempt:lastAutoAttempt}))return;
    lastAutoAttempt=Date.now();busy=true;ownsBusy=true;
    const r=await api('/api/v2-app',{action:'scan'});
    if(revision===undefined||r.revision>=revision){state=r.state;revision=r.revision;render();}
  }catch(e){notice(e.message);}finally{if(ownsBusy)busy=false;cycling=false;}
}
async function action(body){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);if(body.action==='settings')$('#settings-form').querySelectorAll('input,select').forEach(x=>x.disabled=true);try{const r=await api('/api/v2-app',body);state=r.state;revision=r.revision;if(body.action==='settings'){dirty=false;$('#settings-status').textContent='Ayarlar kaydedildi';}render();notice(body.action==='settings'?'Ayarlar kalıcı olarak kaydedildi.':state.lastError||'İşlem tamamlandı.');}catch(e){notice(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);$('#settings-form').querySelectorAll('input,select').forEach(x=>x.disabled=false);renderHistory();}}
$('#settings-form').addEventListener('input',()=>{dirty=true;$('#settings-status').textContent='Kaydedilmemiş değişiklikler';});
$('#settings-form').addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.target),settings={};for(const [key,,min] of fields)settings[key]=min==='bool'?data.get(key)==='true':Number(data.get(key));action({action:'settings',settings,settingsVersion:settingsRevision});});
$('#scan').onclick=()=>action({action:'scan'});$('#pause').onclick=()=>action({action:'pause'});
$('#position-rows').onclick=e=>{const b=e.target.closest('.close-position');if(b)action({action:'close',id:b.dataset.id});};
$('#reset-test').onclick=()=>{if(state.positions.length){notice('Önce açık pozisyonların tamamını kapatın.');return;}if(confirm('Bakiye 1.000 USDT olarak yeniden başlatılsın mı? İşlem geçmişi korunacaktır.'))action({action:'reset-test'});};
$('#history-more').onclick=()=>loadHistory();
$('#research-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const b=e.target.querySelector('button');b.disabled=true;b.textContent='Hesaplanıyor…';try{const r=await api('/api/v2-research',{symbol:$('#research-symbol').value});renderResearch(r.result);notice('Geçmiş test tamamlandı ve kaydedildi.');}catch(e){notice(e.message);}finally{busy=false;b.disabled=false;b.textContent='Test ve doğrulama başlat ↗';}};
async function login(signup=false){try{$('#auth-message').textContent='Bağlanılıyor…';const s=await auth(signup?'signup':'token?grant_type=password',{email:$('#email').value,password:$('#password').value});if(!s.access_token){$('#auth-message').textContent='E-posta doğrulamasını tamamlayıp giriş yapın.';return;}saveSession(s);await refresh();}catch(e){$('#auth-message').textContent=e.message;}}
$('#auth-form').onsubmit=e=>{e.preventDefault();login();};$('#register').onclick=()=>{if($('#auth-form').reportValidity())login(true);};
$('#logout').onclick=async()=>{if(session?.access_token&&cfg)await fetch(cfg.url+'/auth/v1/logout',{method:'POST',headers:{apikey:cfg.key,Authorization:`Bearer ${session.access_token}`}}).catch(()=>{});sessionStorage.removeItem('kv2-session');location.href='/';};
async function boot(){
  $('#clock').textContent=new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Istanbul'});
  if(preview){state={balance:1000,equity:1000,peak:1000,positions:[],trades:[],signals:[],curve:[],settings:{auto:false,paused:false,leverage:5,riskPct:.5,dailyLossPct:3,maxDrawdownPct:8,maxOpenRiskPct:2,maxMarginPct:20,maxPositions:3,minScore:80,minVotes:3,atrMult:2,rewardRisk:2,cooldownMinutes:60,feeRate:.0005,slippageBps:5,maintenanceRate:.01,maxSpreadBps:8,minVolume:20000000}};revision=0;render();notice('ARAYÜZ ÖNİZLEMESİ · Binance ve Supabase bağlantısı yok. Gösterilen 1.000 USDT başlangıç değeridir; işlem yapılmaz.');document.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);return;}
  $('#login').classList.remove('hidden');
  try{await loadConfig();session=JSON.parse(sessionStorage.getItem('kv2-session')||'null');if(session)await refresh();}catch(e){$('#auth-message').textContent=e.message;}
  setInterval(backgroundCycle,15000);
  $('#settings-form').addEventListener('invalid',e=>{if(e.target.closest('#advanced-settings'))$('#advanced-settings').open=true;},true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)backgroundCycle();});
  backgroundCycle();
}boot();
