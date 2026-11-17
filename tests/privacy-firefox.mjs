// Firefox's native WebDriver BiDi. Local mode fulfills first-party requests
// from the checkout. --live disables interception. GPC is never simulated here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const live=process.argv.includes('--live');
const headed=process.argv.includes('--headed');
const autoplayOnly=process.argv.includes('--autoplay-only');
const root=process.cwd();
const executable='C:/Program Files/Mozilla Firefox/firefox.exe';
const headerPairs=fs.readFileSync('_headers','utf8').split(/\r?\n/).filter(l=>/^  [A-Za-z]/.test(l)).map(l=>{const i=l.indexOf(':');return {name:l.slice(0,i).trim(),value:{type:'string',value:l.slice(i+1).trim()}};});
const routes=['/','/sota','/signal_archive',...['age-of-becoming','engine-of-transcendence','self','the-emergence','not-alone','event-horizon-of-the-phoenix','drone-alpha-2'].map(s=>'/decrypt/'+s),'/privacy/','/contact/'];
function fixture(url) {
  const u=new URL(url);let file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep) && file!==root)throw Error('Invalid path');
  if(fs.existsSync(file) && fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file) && fs.existsSync(file+'.html'))file+='.html';
  const found=fs.existsSync(file) && fs.statSync(file).isFile();if(!found)file=path.join(root,'404.html');
  const type={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'}[path.extname(file)]||'application/octet-stream';
  return {statusCode:found?200:404,headers:[...headerPairs,{name:'Content-Type',value:{type:'string',value:type}}],body:{type:'base64',value:fs.readFileSync(file).toString('base64')}};
}
class BiDi {
  constructor(socket) {this.socket=socket;this.id=0;this.pending=new Map();this.events=[];socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.type==='error'?p.reject(Error(p.method+': '+m.error+' '+m.message)):p.resolve(m.result);}else this.events.forEach(fn=>fn(m));});}
  send(method,params={}) {const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('BiDi timeout: '+method));},30000);this.pending.set(id,{resolve,reject,timer,method});this.socket.send(JSON.stringify({id,method,params}));});}
}
const report={date:new Date().toISOString(),mode:live?'production':'local source interception at production origin',headless:!headed,runs:[]};
for(const privateWindow of [false,true]) {
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'exozenth-firefox-'));
  // Preserve actual Strict tracking protection rather than automation defaults.
  fs.writeFileSync(path.join(profile,'user.js'),[
    'user_pref("remote.prefs.recommended", false);',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("browser.contentblocking.category", "strict");',
    'user_pref("privacy.trackingprotection.enabled", true);',
    'user_pref("privacy.trackingprotection.pbmode.enabled", true);',
    'user_pref("privacy.globalprivacycontrol.enabled", false);',
    'user_pref("privacy.globalprivacycontrol.pbmode.enabled", true);'
  ].join('\n'));
  const child=spawn(executable,[...(!headed?['-headless']:[]),'-no-remote','-profile',profile,'--remote-debugging-port','0',...(privateWindow?['-private-window']:[]),'about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
  let bidi;
  const run={privateWindow,trackingProtection:'Strict',checks:[]};report.runs.push(run);
  try {
    for(let i=0;!output.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/)&&i<150;i++)await delay(100);
    const match=output.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);if(!match)throw Error('Firefox startup: '+output.slice(-1500));
    const socket=new WebSocket(match[1].replace(/\/$/,'')+'/session');
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    bidi=new BiDi(socket);
    const session=await bidi.send('session.new',{capabilities:{}});run.version=session.capabilities.browserVersion;
    await bidi.send('session.subscribe',{events:['network.beforeRequestSent','network.responseCompleted','log.entryAdded']});
    const requests=[],errors=[],responses=[];
    run.providerWarnings=[];
    bidi.events.push(m=>{
      if(m.method==='network.beforeRequestSent') {
        const p=m.params;requests.push(p.request.url);
        if(p.isBlocked) {try{const response=fixture(p.request.url);bidi.send('network.provideResponse',{request:p.request.request,...response}).catch(e=>errors.push(e.message));}catch(e){errors.push(e.message);}}
      }
      if(m.method==='network.responseCompleted')responses.push({url:m.params.response.url,status:m.params.response.status});
      if(m.method==='log.entryAdded' && m.params.type==='javascript' && m.params.level==='error') {
        if(m.params.text.startsWith('Cookie ')) run.providerWarnings.push(m.params.text);
        else if(m.params.text.includes('Content-Security-Policy:') && m.params.text.includes('static.cloudflareinsights.com')) {
          run.hostingBlockedAttempts ||= [];run.hostingBlockedAttempts.push(m.params.text);
        }
        else errors.push(m.params.text);
      }
    });
    if(!live)await bidi.send('network.addIntercept',{phases:['beforeRequestSent'],urlPatterns:[{type:'pattern',protocol:'https',hostname:'exozenth.com'}]});
    const tree=await bidi.send('browsingContext.getTree',{});const context=tree.contexts[0].context;
    async function exec(expression) {const r=await bidi.send('script.evaluate',{expression,target:{context},awaitPromise:true});if(r.type==='exception')throw Error(r.exceptionDetails.text);return r.result;}
    async function value(expression) {const r=await exec('JSON.stringify(('+expression+'))');return JSON.parse(r.value);}
    async function navigate(route) {requests.length=0;errors.length=0;responses.length=0;await bidi.send('browsingContext.navigate',{context,url:'https://exozenth.com'+route,wait:'complete'});await delay(600);}
    const thirdParty=()=>requests.filter(u=>/^https?:/.test(u)&&new URL(u).hostname!=='exozenth.com');
    await navigate('/');
    run.gpc=await value('navigator.globalPrivacyControl');assert.equal(run.gpc,privateWindow,'native GPC value');
    assert.equal(await value('document.querySelector("dialog").open'),!privateWindow);
    assert.deepEqual(thirdParty(),[]);
    for(const route of autoplayOnly?['/']:routes) {
      await navigate(route);await exec('window.scrollTo(0,document.body.scrollHeight)');await delay(150);
      assert.deepEqual(thirdParty(),[],route+': optional request before Accept');
      assert.equal(await value('document.querySelectorAll("iframe[src]").length'),0);
      assert.deepEqual(errors,[]);run.checks.push({page:route,beforeAccept:'pass'});
    }
    if(privateWindow) {
      await exec('exoZenthConsent.openSettings()');assert.equal(await value('document.querySelector("[data-consent-accept]").disabled'),true);
      assert.match(await value('document.querySelector("[data-consent-status]").textContent'),/private or incognito window/);
      await exec('localStorage.setItem("exozenth_consent_v1",JSON.stringify({choice:"accepted",expiresAt:Date.now()+60000}))');await navigate('/');
      assert.equal(await value('exoZenthConsent.hasConsent()'),false);assert.deepEqual(thirdParty(),[]);run.checks.push({nativePrivateGPC:'pass'});
    } else {
      await navigate('/');await exec('document.querySelector("[data-consent-accept]").click()');await delay(5000);
      assert.equal(await value('exoZenthConsent.hasConsent()'),true);
      if(autoplayOnly) {
        async function playback() {
          let state;
          for(let i=0;i<80;i++) {
            state=await value('(()=>{const p=window.YT?.get?.("intercept-video");return {state:p?.getPlayerState?.(),muted:p?.isMuted?.()}})()');
            if(state.state===1)break;
            await delay(250);
          }
          assert.equal(state.state,1,'featured video autoplays');assert.equal(state.muted,true,'autoplay is muted');return state;
        }
        run.checks.push({afterAccept:await playback()});await navigate('/');run.checks.push({savedConsent:await playback()});
      }
      // Strict ETP is allowed to block analytics. It must not break cookie controls.
      await exec('exoZenthConsent.openSettings()');assert.equal(await value('document.querySelector("dialog").open'),true);assert.deepEqual(errors,[]);
      for(const route of autoplayOnly?[]:['/decrypt/age-of-becoming','/decrypt/engine-of-transcendence']) {
        await navigate(route);await exec('document.querySelector("iframe").scrollIntoView()');await delay(2000);
        assert.match(await value('document.querySelector("iframe").src'),/open.spotify.com\/embed/);
        assert.deepEqual(errors,[]);run.checks.push({page:route,afterAccept:'pass'});
      }
      run.cookies=(await bidi.send('storage.getCookies',{})).cookies.map(({name,domain,path,expiry,secure,httpOnly,sameSite})=>({name,domain,path,expiry,secure,httpOnly,sameSite}));
      await exec('exoZenthConsent.openSettings()');
      await exec('document.querySelector("[data-consent-reject]").click()');await delay(2000);await navigate('/');
      assert.equal(await value('exoZenthConsent.hasConsent()'),false);assert.deepEqual(thirdParty(),[]);assert.equal(await value('document.querySelectorAll("iframe[src]").length'),0);
      run.checks.push({strictAcceptSettingsReject:'pass'});
    }
    console.log('Firefox '+(privateWindow?'private GPC':'normal Strict')+': PASS '+run.checks.length+' checks.');
  } catch(error) {run.failure=error.stack;console.error(error.stack);process.exitCode=1;}
  finally {if(bidi){try{await bidi.send('browser.close',{});}catch{}bidi.socket.close();}child.kill();}
}
fs.writeFileSync(autoplayOnly?(live?'tests/privacy-production-firefox-autoplay-results.json':'tests/privacy-firefox-autoplay-results.json'):live?'tests/privacy-production-firefox-results.json':'tests/privacy-firefox-results.json',JSON.stringify(report,null,2)+'\n');
