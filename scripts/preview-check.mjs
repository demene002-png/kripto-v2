// Optional local UI check. npm test has no external dependency.
const runtime=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=runtime?await import(runtime+'/playwright/index.mjs'):await import('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1500,height:1050},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:3000/?preview=1');await page.waitForSelector('#dashboard:not(.hidden)');
if(await page.locator('#equity').textContent()!=='1.000,00')throw Error('Başlangıç bakiyesi önizlemede yanlış.');
await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('Mobil sayfa taşıyor.');
await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true});
await page.goto('http://127.0.0.1:3000/');await page.waitForSelector('#login:not(.hidden)');
if(errors.length)throw Error(errors.join('; '));
console.log('Arayüz: masaüstü/mobil önizleme, başlangıç bakiyesi, taşma ve JS hata kontrolleri geçti.');await browser.close();
