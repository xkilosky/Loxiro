// A real cross-origin HTTP fixture, not a shipped download proxy or speed benchmark.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const BASE = process.env.LOXIRO_BASE_URL || 'http://localhost:4173';
const MB = 1024 * 1024;
const stats = new Map();
const data = (start, length) => {const b = Buffer.alloc(length); for (let i=0;i<length;i++) b[i]=(start+i)%251; return b;};
const hash = b => createHash('sha256').update(b).digest('hex');
const fixture = createServer((req,res) => {
  const path = new URL(req.url,'http://fixture').pathname;
  const block = path === '/blocked.bin';
  if (!block) {
    res.setHeader('Access-Control-Allow-Origin', new URL(BASE).origin);
    res.setHeader('Access-Control-Allow-Headers','Range, If-Range');
    res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers','Content-Range, ETag, Content-Encoding');
  }
  if (req.method === 'OPTIONS') {res.writeHead(204);res.end();return;}
  let s = stats.get(path); if (!s) {s={parts:0,normal:0,probe:0,active:0,max:0,closed:0};stats.set(path,s);}
  const count = Number(/file-(\d+)/.exec(path)?.[1]) || 8;
  const total = path === '/ignore.bin' ? 1733 : count * MB + 177;
  const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
  if (!range || path === '/ignore.bin') {
    s.normal++;res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':total});res.end(data(0,total));return;
  }
  const start = Number(range[1]), end = Number(range[2]);
  const part = !!req.headers['if-range'];
  if (part) {s.parts++;s.active++;s.max=Math.max(s.max,s.active);} else s.probe++;
  res.writeHead(206,{'Content-Type':'application/octet-stream','Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${total}`,'ETag':path === '/change.bin' && part?'"changed"':'"stable"'});
  if (!part) {res.end(data(start,end-start+1));return;}
  const bytes = data(start,end-start+1);let offset=0;
  // Controlled per-response latency makes real overlapping requests observable.
  const timer=setInterval(()=>{const next=Math.min(offset+64*1024,bytes.length);res.write(bytes.subarray(offset,next));offset=next;if(offset===bytes.length){clearInterval(timer);res.end();}},path==='/cancel.bin'?40:6);
  res.on('close',()=>{clearInterval(timer);s.active--;s.closed++;});
});
await new Promise(resolve=>fixture.listen(0,'0.0.0.0',resolve));
const origin = `http://127.0.0.1:${fixture.address().port}`;
let browser;
try {
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
  const context = await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
  const page = await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${BASE}/#downloads`);
  const add = async (path,name) => {
    await page.getByRole('button',{name:'New download',exact:true}).click();
    await page.getByRole('dialog').getByLabel('File URL').fill(origin+path);
    await page.getByRole('dialog').getByLabel('Save as').fill(name);
    await page.getByRole('button',{name:'Add to queue',exact:true}).click();
    return page.locator('.download-row').filter({has:page.getByText(name,{exact:true})});
  };
  for (const cap of [8,16,32]) {
    await page.getByLabel('Parts per file').selectOption(String(cap));
    const event=page.waitForEvent('download');
    const row=await add(`/file-${cap}.bin`,`parallel-${cap}.bin`);
    const download=await event;await row.getByText(`Saved to browser · ${cap} parts`,{exact:false}).waitFor();
    const bytes=await readFile(await download.path());assert.equal(hash(bytes),hash(data(0,cap*MB+177)));
    const s=stats.get(`/file-${cap}.bin`);assert.equal(s.probe,1);assert.equal(s.parts,cap);assert.equal(s.normal,0);assert.ok(s.max>1,'HTTP fixture observed parallel requests');
    console.log(`PASS real cross-origin ${cap}-part transfer, preflight, ordered SHA-256, max observed HTTP/1.1 overlap ${s.max}`);
  }
  await page.reload();assert.equal(await page.getByLabel('Parts per file').inputValue(),'32');
  let event=page.waitForEvent('download');let row=await add('/ignore.bin','fallback.bin');let download=await event;
  assert.equal(hash(await readFile(await download.path())),hash(data(0,1733)));await row.getByText('Single connection',{exact:true}).waitFor();assert.equal(stats.get('/ignore.bin').normal,1);
  console.log('PASS ignored Range reuses a single complete response');
  event=page.waitForEvent('download');row=await add('/change.bin','changed.bin');download=await event;
  assert.equal(hash(await readFile(await download.path())),hash(data(0,8*MB+177)));await row.getByText('Parallel transfer could not be verified; restarted safely with one connection.').waitFor();assert.equal(stats.get('/change.bin').normal,1);
  console.log('PASS changed ETag cancels range siblings and saves only the fresh complete response');
  let unexpected=0;page.on('download',()=>unexpected++);
  row=await add('/cancel.bin','cancelled.bin');await row.locator('.transfer-mode.parallel').waitFor();await row.getByRole('button',{name:'Cancel cancelled.bin',exact:true}).click();await row.getByText('Cancelled',{exact:true}).waitFor();
  row=await add('/blocked.bin','blocked.bin');await row.getByText(/This source blocks cross-origin downloads/).waitFor();
  await page.waitForTimeout(350);assert.equal(unexpected,0);assert.equal(stats.get('/cancel.bin')?.active || 0,0);
  console.log('PASS active cancellation aborts requests; CORS-blocked source errors honestly; neither saves a file');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.equal(axe.violations.length,0,JSON.stringify(axe.violations));
  for (const width of [360,390,768,1440]) {await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Download screen overflow at ${width}`);}
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Toggle light and dark theme'}).click();await page.waitForTimeout(400);
  const darkAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.equal(darkAxe.violations.length,0,JSON.stringify(darkAxe.violations));
  await page.screenshot({path:'/tmp/loxiro-smart-download.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('PASS download light/dark accessibility, responsive layout, preference persistence, no runtime exceptions');
} finally {
  if (browser) await browser.close();
  fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));
}
