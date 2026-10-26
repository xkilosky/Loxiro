import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Explicit rendering fixtures, not live provider-quality evidence.
  const results=[
    {title:'Solar energy review',url:'https://doi.org/10.1000/solar',domain:'doi.org',kind:'website',contentType:'paper',sources:['Crossref'],extract:'Research metadata; full text may require access.',reason:'Top match from this source'},
    {title:'Solar energy — source on energy.gov',url:'https://www.energy.gov/solar',domain:'energy.gov',kind:'website',contentType:'linked-source',sources:['Wikipedia-linked sources'],extract:'External link, not an independent verification.',discoveredFrom:'https://en.wikipedia.org/wiki/Solar_energy',reason:'Ranked by source position and query match'},
    {title:'Solar energy',url:'https://en.wikipedia.org/wiki/Solar_energy',domain:'en.wikipedia.org',kind:'reference',contentType:'reference',sources:['Wikipedia'],extract:'Supporting encyclopedia.',reason:'Top match from this source'},
    {title:'Cancer study record',url:'https://clinicaltrials.gov/study/NCT12345678',domain:'clinicaltrials.gov',kind:'website',contentType:'clinical-trial',sources:['ClinicalTrials.gov'],extract:'Explicit category rendering fixture, not a solar result.',reason:'Fixture'},
    {title:'Fetch API',url:'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',domain:'developer.mozilla.org',kind:'website',contentType:'documentation',sources:['MDN Web Docs'],extract:'Explicit category rendering fixture, not a solar result.',reason:'Fixture'},
  ];
  let configured=false;
  await page.route('**/api/search?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({query:'solar energy',results,providers:[{id:'crossref',name:'Crossref',kind:'research',access:'keyless',status:'ok',count:1}],topics:['research'],websiteCount:4,referenceCount:1,domainCount:5,limitedWebCoverage:true,webSearchConfigured:configured})}));
  await page.route('https://icons.duckduckgo.com/**',r=>r.abort());
  await page.goto(process.env.LOXIRO_BASE_URL||'http://localhost:4173');await page.getByRole('combobox').fill('solar energy');await page.getByRole('combobox').press('Enter');
  await page.locator('.result-kind').getByText('Research paper',{exact:true}).waitFor();
  for(const label of ['Article-linked source','Reference','Clinical study record','Documentation'])assert.equal(await page.locator('.result-kind').getByText(label,{exact:true}).count(),1);
  assert.equal(await page.locator('.source-provenance').getAttribute('href'),'https://en.wikipedia.org/wiki/Solar_energy');assert.ok((await page.locator('.results-meta').innerText()).includes('5 domains'));
  for(const connected of [false,true]){
    if(connected){configured=true;await page.getByRole('combobox').fill('solar energy sources');await page.getByRole('combobox').press('Enter');await page.locator('.result-kind').getByText('Research paper',{exact:true}).waitFor();}
    assert.equal(await page.locator('.coverage-notice,.web-setup-details').count(),0);
    assert.equal(await page.getByText('Limited coverage right now.',{exact:true}).count(),0);
    assert.equal(await page.getByText('Enable broader website search',{exact:true}).count(),0);
    assert.equal(await page.getByRole('link',{name:'Open secure environment settings'}).count(),0);
  }
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow at ${width}`);}
  for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.waitForTimeout(400);const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),[],`${theme} search accessibility`);}
  assert.deepEqual(errors,[]);console.log('PASS research/source categories, discovery trail, no coverage/setup banner for missing-key or outage responses, domain count, responsive light/dark accessibility, no runtime exceptions');
}finally{await browser.close();}
