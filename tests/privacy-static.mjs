import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
function pages(dir='.') { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name.startsWith('.') || ['tests'].includes(e.name) ? [] : e.isDirectory() ? pages(path.join(dir,e.name)) : e.name.endsWith('.html') ? [path.join(dir,e.name)] : []); }
const htmlPages=pages();
assert.equal(htmlPages.length,22);
for(const file of htmlPages) {
  const html=fs.readFileSync(file,'utf8');
  assert.match(html, /src="\/assets\/consent.js/ ,file);
  assert.match(html, /data-cookie-settings/,file);
  assert.match(html, /href="\/privacy\/"/,file);
  assert.match(html, /href="\/contact\/"/,file);
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com|googletagmanager\.com|connect\.facebook\.net/ ,file);
  assert.doesNotMatch(html, /<iframe[^>]*\ssrc=/,file);
  assert.doesNotMatch(html, /<script>(?!<)/,file);
  assert.doesNotMatch(html, /\u2014|&mdash;|&#8212;|&#x2014;/i,file);
  for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)/g)) assert.ok(fs.existsSync('.'+match[1]),file+': '+match[1]);
}
const form=fs.readFileSync('contact/index.html','utf8');
assert.match(form, /<form action="https:\/\/formspree.io\/f\/mkjrrvzj" method="post">/);
assert.match(form, /type="email"[^>]*required/);
assert.match(form, /name="_gotcha"/);
assert.doesNotMatch(form, /recaptcha|hcaptcha|turnstile/i);
assert.match(form, /<!--email_off--><a href="mailto:privacy@exozenth.com">privacy@exozenth.com<\/a><!--\/email_off-->/);
const policy=fs.readFileSync('privacy/index.html','utf8');
const headings=[...policy.matchAll(/<h2(?:[^>]*)>([^<]+)<\/h2>/g)].map(m=>m[1]);
assert.deepEqual(headings,['Who we are','The short version','What we collect','Your choices','Cookies and browser storage','Sharing','See, correct or delete your information','Children','Other sites and changes']);
const headers=fs.readFileSync('_headers','utf8');
assert.match(headers,/! Access-Control-Allow-Origin/);
assert.match(headers,/script-src 'self' https:\/\/www.googletagmanager.com https:\/\/www.youtube.com;/);
assert.doesNotMatch(headers,/facebook|cloudflareinsights|fonts.googleapis/);
assert.ok(headers.split(/\r?\n/).every(l=>l.length<=2000));
const fonts=fs.readFileSync('assets/fonts.css','utf8');
assert.doesNotMatch(fonts,/https?:/);
for(const m of fonts.matchAll(/url\(([^)]+)\)/g)) assert.ok(fs.statSync('.'+m[1]).size>1000);
const controller=fs.readFileSync('assets/consent.js','utf8');
// Verify the initial privacy boundary, including exact-boolean GPC, hostile storage,
// expired/invalid records and production hosts. No DOM implementation is mirrored.
function boot({gpc=false,record=null,host='exozenth.com',storageBlocked=false}={}) {
  const storage=new Map(record===null ? [] : [['exozenth_consent_v1',JSON.stringify(record)]]);
  const document={cookie:'',addEventListener(){}};
  const localStorage={getItem:k=>{if(storageBlocked)throw Error('blocked');return storage.get(k)||null;},setItem:(k,v)=>{if(storageBlocked)throw Error('blocked');storage.set(k,v);},removeItem:k=>{if(storageBlocked)throw Error('blocked');storage.delete(k);}};
  const window={addEventListener(){}};
  const context={window,document,localStorage,sessionStorage:{removeItem(){}},navigator:{globalPrivacyControl:gpc},location:{hostname:host,pathname:'/'},Set,Date,JSON,Number};
  vm.runInNewContext(controller,context);
  return {window,storage};
}
for(const gpc of [false,undefined,null,0,'true']) {
  const fresh=boot({gpc}); assert.equal(fresh.window.exoZenthConsent.hasConsent(),false); assert.equal(fresh.storage.size,0);
  const accepted=boot({gpc,record:{choice:'accepted',expiresAt:Date.now()+60000}}); assert.equal(accepted.window.exoZenthConsent.hasConsent(),true);
}
const gpc=boot({gpc:true,record:{choice:'accepted',expiresAt:Date.now()+60000}});
assert.equal(gpc.window.exoZenthConsent.hasConsent(),false);
assert.equal(JSON.parse(gpc.storage.get('exozenth_consent_v1')).choice,'rejected');
for(const expiresAt of [Date.now()-1,Date.now()+184*86400000,'tomorrow',null]) assert.equal(boot({record:{choice:'accepted',expiresAt}}).window.exoZenthConsent.hasConsent(),false);
assert.equal(boot({storageBlocked:true}).window.exoZenthConsent.hasConsent(),false);
for(const host of ['exozenth.com','www.exozenth.com']) assert.equal(boot({host}).window.exoZenthConsent.isProduction,true);
for(const host of ['localhost','exozenth.pages.dev','evil-exozenth.com']) assert.equal(boot({host}).window.exoZenthConsent.isProduction,false);
const initial=boot().window.dataLayer;
assert.equal(initial[0][0],'consent'); assert.equal(initial[0][1],'default');
assert.deepEqual(Object.values(initial[0][2]),Array(4).fill('denied'));
console.log(`PASS: ${htmlPages.length} HTML files, contact fields, policy structure, fonts, CSP, consent defaults, storage failures, expiry, GPC and hostname boundaries.`);
