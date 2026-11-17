// Dependency-free browser checks. Default mode intercepts first-party URLs to
// serve this checkout at the production origin; it is NOT production verification.
// --live reads the actual deployed site without interception.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const live=process.argv.includes('--live');
const headed=process.argv.includes('--headed');
const browsers=[['Chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['Edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']];
const root=process.cwd();
const headers=fs.readFileSync('_headers','utf8').split(/\r?\n/).filter(l=>/^  [A-Za-z]/.test(l)).map(l=>{const i=l.indexOf(':');return {name:l.slice(0,i).trim(),value:l.slice(i+1).trim()};});
const redirects=fs.readFileSync('_redirects','utf8').split(/\r?\n/).filter(l=>l.startsWith('/')).map(l=>l.trim().split(/\s+/));
const pages=['/','/sota','/signal_archive',...['age-of-becoming','engine-of-transcendence','self','the-emergence','not-alone','event-horizon-of-the-phoenix','drone-alpha-2'].map(s=>'/decrypt/'+s),'/privacy/','/contact/','/404.html'];
function resource(url) {
  const u=new URL(url);
  const redirect=redirects.find(r=>r[0]===u.pathname);
  if(redirect) return {responseCode:Number(redirect[2]),responseHeaders:[{name:'Location',value:redirect[1]+u.search}],body:''};
  const relative=decodeURIComponent(u.pathname);
  let file=path.resolve(root,'.'+relative);
  if(!file.startsWith(root+path.sep) && file!==root) return null;
  if(fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
  if(!fs.existsSync(file) && fs.existsSync(file+'.html')) file+='.html';
  const found=fs.existsSync(file) && fs.statSync(file).isFile();
  if(!found) file=path.join(root,'404.html');
  const ext=path.extname(file);
  const type={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'}[ext]||'application/octet-stream';
  return {responseCode:found?200:404,responseHeaders:[...headers,{name:'Content-Type',value:type}],body:fs.readFileSync(file).toString('base64')};
}
class CDP {
  constructor(socket) {
    this.socket=socket;this.id=0;this.pending=new Map();this.listeners=[];
    socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else this.listeners.forEach(fn=>fn(m));});
  }
  send(method,params={},sessionId) {const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},25000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params,...sessionId&&{sessionId}}));});}
}
const report={date:new Date().toISOString(),mode:live?'production':'local source interception at production origin',headless:!headed,browsers:[]};
for(const [name,executable] of browsers) {
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'exozenth-privacy-'));
  const child=spawn(executable,[...(!headed?['--headless=new']:[]),'--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','about:blank'],{windowsHide:true,stdio:'ignore'});
  let cdp;
  try {
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;!fs.existsSync(portFile)&&i<100;i++) await delay(100);
    const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);
    const socket=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    cdp=new CDP(socket);
    const result={browser:name,version:(await cdp.send('Browser.getVersion')).product,checks:[],cookies:[]};
    report.browsers.push(result);
    async function page({gpc=false,blocked=false,host='exozenth.com',js=true}={}) {
      // Use the temporary profile's regular browsing context, not incognito.
      const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
      const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
      const send=(method,params={})=>cdp.send(method,params,sessionId);
      const requests=[],errors=[],csp=[],responses=[];
      cdp.listeners.push(m=>{
        if(m.sessionId!==sessionId)return;
        if(m.method==='Network.requestWillBeSent' && /^https?:/.test(m.params.request.url))requests.push(m.params.request.url);
        if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
        if(m.method==='Network.responseReceived') responses.push({url:m.params.response.url,status:m.params.response.status,headers:m.params.response.headers});
        if(m.method==='Log.entryAdded' && /Content Security Policy|TrustedHTML|TrustedScriptURL/.test(m.params.entry.text))csp.push(m.params.entry.text);
        if(m.method==='Fetch.requestPaused') {const data=resource(m.params.request.url);send(data?'Fetch.fulfillRequest':'Fetch.failRequest',data?{requestId:m.params.requestId,...data}:{requestId:m.params.requestId,errorReason:'Failed'}).catch(e=>errors.push(e.message));}
      });
      await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Log.enable');
      await send('Storage.clearDataForOrigin',{origin:'https://'+host,storageTypes:'all'});
      await send('Network.clearBrowserCookies');
      await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
      await send('Emulation.setScriptExecutionDisabled',{value:!js});
      if(gpc) await send('Page.addScriptToEvaluateOnNewDocument',{source:'Object.defineProperty(navigator,"globalPrivacyControl",{get:()=>true});'});
      if(blocked) await send('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
      if(!live) await send('Fetch.enable',{patterns:[{urlPattern:'https://'+host+'/*',requestStage:'Request'}]});
      const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
      async function navigate(route) {requests.length=0;errors.length=0;responses.length=0;csp.length=0;await send('Page.navigate',{url:'https://'+host+route});for(let i=0;i<80;i++){await delay(100);try{if(await evaluate('document.readyState === "complete"'))break;}catch{}}await delay(450);}
      const thirdParty=()=>requests.filter(u=>new URL(u).hostname!==host);
      const cookies=async()=>{
        const all=(await cdp.send('Storage.getCookies')).cookies;
        // Edge's first-run background services create Bing/MSN cookies outside
        // the tested page. Keep these separate from site/provider observations.
        const related=c=>/(^|\.)(exozenth\.com|youtube\.com|youtube-nocookie\.com|spotify\.com|google\.com|google-analytics\.com|doubleclick\.net)$/.test(c.domain.replace(/^\./,''));
        result.browserBackgroundCookieDomains=[...new Set(all.filter(c=>!related(c)).map(c=>c.domain))];
        return all.filter(related).map(({name,domain,path,expires,secure,httpOnly,sameSite,session})=>({name,domain,path,expires,secure,httpOnly,sameSite,session}));
      };
      return {send,evaluate,navigate,requests,errors,csp,responses,thirdParty,cookies,close:()=>cdp.send('Target.closeTarget',{targetId})};
    }
    const p=await page();
    for(const route of pages) {
      await p.navigate(route);
      assert.equal(await p.evaluate('document.querySelector("dialog").open'),true,route+': fresh dialog');
      await p.evaluate('document.querySelector(".consent-actions button:last-child").click();window.scrollTo(0,document.body.scrollHeight)');await delay(250);
      assert.deepEqual(p.thirdParty(),[],route+': pre-consent requests');
      assert.equal(await p.evaluate('document.querySelectorAll("iframe[src]").length'),0,route+': inactive embeds');
      assert.equal(await p.evaluate('document.querySelectorAll("footer [data-cookie-settings]").length'),1,route+': footer');
      assert.deepEqual(p.errors,[],route+': errors');
      assert.deepEqual(p.csp,[],route+': CSP errors');
      result.checks.push({page:route,beforeAccept:'pass'});
    }
    assert.deepEqual(await p.cookies(),[],'no pre-consent cookies');
    await p.navigate('/');
    for (const width of [1280,390]) {
      await p.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
      assert.equal(await p.evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'horizontal overflow at '+width);
      const image=await p.send('Page.captureScreenshot',{format:'png'});
      const screenshot=path.join(os.tmpdir(),`exozenth-${name}-${width}.png`);
      fs.writeFileSync(screenshot,Buffer.from(image.data,'base64'));
      result.checks.push({width,screenshot});
    }
    await p.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await p.evaluate('document.querySelector("[data-consent-accept]").click()');await delay(6000);
    assert.equal(await p.evaluate('exoZenthConsent.hasConsent()'),true);
    assert.equal(await p.evaluate('document.querySelector("dialog").open'),false);
    assert.ok(p.requests.some(u=>u.includes('googletagmanager.com/gtag/js')),'GA request');
    assert.ok(p.requests.some(u=>u.includes('youtube.com/iframe_api')),'YouTube API request');
    assert.match(await p.evaluate('document.querySelector("iframe").src'),/youtube-nocookie.com.*autoplay=0&mute=1/);
    const stored=await p.evaluate('JSON.parse(localStorage.getItem("exozenth_consent_v1"))');
    assert.ok(Math.abs(stored.expiresAt-Date.now()-183*86400000)<10000);
    assert.deepEqual(p.errors,[],'post-accept runtime errors');
    assert.deepEqual(p.csp,[],'post-accept CSP errors');
    const outbound=await p.evaluate('document.addEventListener("click",e=>e.preventDefault(),{once:true});document.querySelector(".streaming-links a").click();Array.from(dataLayer).filter(a=>a[0]==="event" && a[1]==="outbound_link_click").map(a=>a[2]).at(-1)');
    assert.deepEqual(Object.keys(outbound).sort(),['link_url','page_path']);
    await p.evaluate('document.querySelector(".intercept-preset[data-video-id=PXMteTv7zK8]").click()');await delay(3000);
    const playerState=await p.evaluate('({id:document.querySelector("iframe").src,title:document.querySelector("iframe").title})');
    result.checks.push({accept:'pass',preset:playerState});
    for(const route of ['/decrypt/age-of-becoming','/decrypt/engine-of-transcendence']) {
      await p.navigate(route);await p.evaluate('document.querySelector("iframe").scrollIntoView()');await delay(3000);
      assert.match(await p.evaluate('document.querySelector("iframe").src'),/open.spotify.com\/embed/);
      assert.ok(p.requests.some(u=>u.includes('googletagmanager.com/gtag/js')));
      assert.deepEqual(p.errors,[]);assert.deepEqual(p.csp,[]);
      result.checks.push({page:route,afterAccept:'pass'});
    }
    result.cookies=await p.cookies();
    await p.evaluate('localStorage.setItem("exozenth_attribution_v1","legacy");sessionStorage.setItem("exozenth_ga4_debug","1");document.cookie="_fbp=test; Path=/; Secure";exoZenthConsent.openSettings();document.querySelector("[data-consent-reject]").click()');await delay(1800);
    assert.equal(await p.evaluate('exoZenthConsent.hasConsent()'),false);
    assert.deepEqual(await p.evaluate('Object.keys(localStorage)'),['exozenth_consent_v1']);
    assert.equal(await p.evaluate('sessionStorage.getItem("exozenth_ga4_debug")'),null);
    assert.equal((await p.cookies()).filter(c=>c.domain.includes('exozenth.com')).length,0);
    await p.navigate('/');assert.deepEqual(p.thirdParty(),[]);assert.equal(await p.evaluate('document.querySelector("dialog").open'),false);
    result.checks.push({withdrawal:'pass'});
    await p.close();
    const g=await page({gpc:true});await g.navigate('/');
    assert.equal(await g.evaluate('document.querySelector("dialog").open'),false);assert.deepEqual(g.thirdParty(),[]);
    await g.evaluate('exoZenthConsent.openSettings()');assert.equal(await g.evaluate('document.querySelector("[data-consent-accept]").disabled'),true);
    assert.match(await g.evaluate('document.querySelector("[data-consent-status]").textContent'),/private or incognito window/);
    await g.evaluate('localStorage.setItem("exozenth_consent_v1",JSON.stringify({choice:"accepted",expiresAt:Date.now()+60000}))');await g.navigate('/');
    assert.equal(await g.evaluate('exoZenthConsent.hasConsent()'),false);assert.deepEqual(g.thirdParty(),[]);await g.close();
    result.checks.push({simulatedGPC:'pass'});
    const b=await page({blocked:true});await b.navigate('/privacy/');await b.evaluate('document.querySelector("[data-consent-accept]").click();exoZenthConsent.openSettings()');
    assert.equal(await b.evaluate('document.querySelector("dialog").open'),true);assert.deepEqual(b.errors,[]);await b.close();result.checks.push({blockedAnalyticsDialog:'pass'});
    if(!live) {
      const preview=await page({host:'exozenth.pages.dev'});await preview.navigate('/privacy/');await preview.evaluate('document.querySelector("[data-consent-accept]").click()');await delay(250);assert.deepEqual(preview.thirdParty(),[]);await preview.close();result.checks.push({previewHost:'pass'});
    }
    const n=await page({js:false});await n.navigate('/contact/');
    assert.equal(await n.evaluate('document.querySelector("form").action'),'https://formspree.io/f/mkjrrvzj');
    assert.equal(await n.evaluate('document.querySelector("a[href^=mailto]").textContent'),'privacy@exozenth.com');
    assert.deepEqual(n.thirdParty(),[]);
    await n.navigate('/privacy/');
    assert.equal(await n.evaluate('document.querySelector("a[href^=mailto]").textContent'),'privacy@exozenth.com');
    assert.equal(await n.evaluate('document.querySelector("a[href^=mailto]").getBoundingClientRect().height > 0'),true);
    assert.deepEqual(n.thirdParty(),[]);await n.close();result.checks.push({noJavaScriptContactMarkupAndPrivacyEmail:'pass; submission not exercised'});
    const missing=await page();await missing.navigate('/missing-privacy-audit-page');assert.equal(missing.responses.find(r=>r.url.includes('/missing-privacy-audit-page'))?.status,404);await missing.close();result.checks.push({notFound:'pass'});
    console.log(name+': PASS '+result.checks.length+' checks; '+result.cookies.length+' provider cookies captured.');
  } catch(error) {report.browsers.at(-1).failure=error.stack;console.error(name+': '+error.stack);process.exitCode=1;}
  finally {if(cdp){try{await cdp.send('Browser.close');}catch{}cdp.socket.close();}child.kill();}
}
fs.writeFileSync(live?'tests/privacy-production-browser-results.json':'tests/privacy-browser-results.json',JSON.stringify(report,null,2)+'\n');
