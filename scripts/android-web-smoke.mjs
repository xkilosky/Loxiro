// Verifies hosted-page presentation under the native UA; native WebViews are tested on Android CI.
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
const BASE=process.env.LOXIRO_BASE_URL || 'http://localhost:4173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox'],headless:true});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 LoxiroAndroid/0.7'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('https://files.example.org/*',r=>r.fulfill({contentType:'text/html',body:'<title>File destination fixture</title>Native shell handles real downloadable responses.'}));
 await page.route('**/api/search?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({query:'space science',results:[],providers:[],limitedWebCoverage:true,websiteCount:0,referenceCount:0,webSearchConfigured:false})}));
 await page.goto(BASE);assert.equal(await page.getByRole('navigation',{name:'Loxiro tabs',exact:true}).count(),0);
 assert.equal(await page.getByRole('combobox').count(),0);assert.equal(await page.locator('.searchbox').count(),0);
 await page.getByText('Search or enter a website in the address bar above.',{exact:true}).waitFor();
 await page.goto(BASE+'/?android-shell=1#results?q=space+science');
 await page.getByRole('heading',{name:'Results for “space science”',exact:true}).waitFor();
 assert.equal(await page.getByRole('combobox').count(),0);assert.equal(await page.locator('.searchbox').count(),0);
 await page.keyboard.press('Control+k');assert.ok(page.url().includes('#results?'));
 const count=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('loxiro:v2:tabs')).tabs.length);
 const before=await count();await page.keyboard.press('Alt+Shift+N');assert.equal(await count(),before);
 await page.goto(BASE+'/#downloads');await page.getByRole('heading',{name:'Downloads, handled by Android.',exact:true}).waitFor();assert.equal(await page.locator('.download-smart-panel').count(),0);
 await page.getByRole('button',{name:'New download',exact:true}).click();assert.equal(await page.getByRole('dialog').getByLabel('Save as').count(),0);await page.getByRole('dialog').getByLabel('File URL').fill('https://files.example.org/file.zip');
 const popupEvent=page.waitForEvent('popup');await page.getByRole('button',{name:'Add to queue',exact:true}).click();const popup=await popupEvent;await popup.waitForURL('https://files.example.org/file.zip');await popup.close();
 await page.getByRole('button',{name:'Settings',exact:false}).first().click();assert.equal(await page.getByRole('button',{name:'Export',exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('Smart download parts').count(),0);await page.getByRole('button',{name:'Clear web-app data',exact:true}).click();await page.getByText('This clears web-app storage only.',{exact:false}).waitFor();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 for(const route of ['home','results?q=space+science','downloads','settings']){await page.goto(BASE+'/#'+route);await page.waitForTimeout(300);const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.equal(axe.violations.length,0,JSON.stringify(axe.violations));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);
 const ordinary=await browser.newContext({userAgent:'Mozilla/5.0 Android',viewport:{width:390,height:844}});const web=await ordinary.newPage();await web.goto(BASE);await web.getByRole('navigation',{name:'Loxiro tabs',exact:true}).waitFor();assert.equal(await web.getByRole('combobox').count(),1);
 await web.goto(BASE+'/#results?q=space+science');await web.getByRole('combobox').waitFor();assert.equal(await web.getByRole('combobox').count(),1);
 console.log('PASS native hosted-page compatibility: native-only omnibox on Home/results, one tab switcher, no hidden workspace shortcuts, honest native download/export/clear-data scope, responsive/axe, ordinary Android web remains unchanged');
} finally {await browser.close();}
