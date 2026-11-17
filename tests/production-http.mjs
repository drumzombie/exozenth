import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
function get(route) {
  const raw=execFileSync('curl.exe',['-sS','--max-time','20','-i','https://exozenth.com'+route],{encoding:'utf8'});
  const split=raw.indexOf('\r\n\r\n');const head=raw.slice(0,split);const body=raw.slice(split+4);
  const headers=Object.fromEntries(head.split('\r\n').slice(1).map(l=>{const i=l.indexOf(':');return [l.slice(0,i).toLowerCase(),l.slice(i+1).trim()];}));
  return {status:Number(head.match(/^HTTP\/\S+ (\d+)/)?.[1]),headers,body};
}
let home;
for(let i=0;i<12;i++) {home=get('/');if(home.body.includes('/assets/consent.js'))break;await delay(3000);}
assert.ok(home.body.includes('/assets/consent.js'),'new production deployment not yet available');
const routes=['/','/sota','/signal_archive',...['age-of-becoming','engine-of-transcendence','self','the-emergence','not-alone','event-horizon-of-the-phoenix','drone-alpha-2'].map(s=>'/decrypt/'+s),'/privacy/','/contact/'];
const report={date:new Date().toISOString(),pages:[],redirects:[]};
for(const route of routes) {
  const r=get(route);assert.equal(r.status,200,route);
  assert.ok(r.body.includes('/assets/consent.js'),route+': consent');
  assert.doesNotMatch(r.body,/<script[^>]*src="https?:/,route+': injected script');
  assert.doesNotMatch(r.body,/fonts.googleapis.com|fonts.gstatic.com/,route+': remote fonts');
  assert.match(r.headers['content-security-policy'],/default-src 'self'/,route+': CSP');
  assert.equal(r.headers['access-control-allow-origin'],undefined,route+': CORS');
  assert.equal(r.headers['set-cookie'],undefined,route+': server cookie');
  if(route==='/contact/')assert.match(r.body,/https:\/\/formspree.io\/f\/mkjrrvzj/);
  if(route==='/privacy/' || route==='/contact/') {assert.match(r.body,/href="mailto:privacy@exozenth.com">privacy@exozenth.com/);assert.doesNotMatch(r.body,/data-cfemail|email-decode/);}
  report.pages.push({route,status:r.status,csp:r.headers['content-security-policy'],cors:'absent',serverCookies:'none',emailPlain:route==='/privacy/'||route==='/contact/'});
}
for(const route of ['/missing-privacy-audit-page','/privacy/missing','/contact/missing']) {const r=get(route);assert.equal(r.status,404);assert.ok(r.body.includes('Signal not found'));report.pages.push({route,status:r.status});}
for(const line of fs.readFileSync('_redirects','utf8').split(/\r?\n/).filter(l=>l.startsWith('/'))) {
  const [from,to,status]=line.trim().split(/\s+/);const r=get(from);assert.equal(r.status,Number(status),from);assert.equal(new URL(r.headers.location,'https://exozenth.com').pathname,to);report.redirects.push({from,to,status:r.status});
}
fs.writeFileSync('tests/privacy-production-http-results.json',JSON.stringify(report,null,2)+'\n');
console.log(`PASS production HTTP: ${report.pages.length} pages/status checks and ${report.redirects.length} preserved redirects; CSP present, CORS wildcard absent, public emails plain HTML.`);
