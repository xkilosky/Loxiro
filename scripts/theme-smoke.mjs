import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const BASE=process.env.LOXIRO_BASE_URL||'http://localhost:4173';
try{
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE);await page.getByRole('combobox').waitFor();
  async function palette(theme,bg,accent){
    await page.waitForTimeout(400);
    assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
    assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),bg);
    assert.equal(await page.locator('.search-submit').evaluate(e=>getComputedStyle(e).backgroundColor),accent);
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'),theme==='dark'?'#000000':'#ffffff');
  }
  await palette('dark','rgb(0, 0, 0)','rgb(255, 255, 255)');
  // Primary screens: brand mark/buttons must not disappear white-on-white.
  assert.equal(await page.locator('.logo-icon').evaluate(e=>getComputedStyle(e,'::before').backgroundColor),'rgb(0, 0, 0)');
  await page.setViewportSize({width:1440,height:1000});
  for(const theme of ['dark','light']){
    if(theme==='light')await page.getByRole('button',{name:'Toggle light and dark theme'}).click();
    await palette(theme,theme==='dark'?'rgb(0, 0, 0)':'rgb(255, 255, 255)',theme==='dark'?'rgb(255, 255, 255)':'rgb(17, 17, 17)');
    for(const name of ['Smart tools','Spaces','Search']){
      await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name,exact:false}).click();await page.waitForTimeout(250);
      const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${theme}/${name}`);
    }
  }
  await page.reload();await page.getByRole('combobox').waitFor();await palette('light','rgb(255, 255, 255)','rgb(17, 17, 17)');
  await page.getByRole('button',{name:'Settings',exact:false}).first().click();await page.getByRole('button',{name:'system theme',exact:true}).click();
  await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(400);assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.emulateMedia({colorScheme:'light'});await page.waitForTimeout(400);assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  // Enabled white switches need black thumbs on OLED, not white-on-white.
  await page.getByRole('button',{name:'dark theme',exact:true}).click();await page.waitForTimeout(400);
  const toggle=page.locator('.toggle.on>span').first();assert.equal(await toggle.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');
  await context.close();
  // Prove the pre-paint bootstrap works without the React bundle and with saved choices.
  for(const [saved,scheme,expected] of [[null,'light','dark'],['light','dark','light'],['dark','light','dark'],['system','dark','dark'],['system','light','light']]){
    const ctx=await browser.newContext({colorScheme:scheme});
    if(saved)await ctx.addInitScript(theme=>localStorage.setItem('loxiro:v2:settings',JSON.stringify({theme})),saved);
    const p=await ctx.newPage();await p.route('**/assets/*.js',r=>r.abort());await p.goto(BASE);
    assert.equal(await p.locator('html').getAttribute('data-theme'),expected,'Pre-paint saved/default theme');await ctx.close();
  }
  const blocked=await browser.newContext();await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('Storage disabled');}}));
  const p=await blocked.newPage();await p.goto(BASE);await p.getByRole('combobox').waitFor();assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');await blocked.close();
  assert.deepEqual(errors,[]);console.log('PASS OLED default on light OS, true-black canvas, white accents, logo/thumb contrast, White persistence, System changes, pre-paint and disabled-storage fallback, both-theme Home/Spaces/Tools axe');
}finally{await browser.close();}
