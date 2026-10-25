import { cpSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
rmSync('.vercel/output', {recursive:true,force:true});
mkdirSync('.vercel/output/static', {recursive:true});
cpSync('dist','.vercel/output/static',{recursive:true});
mkdirSync('.vercel/output/functions/api/search.func', {recursive:true});
cpSync('server/search.mjs','.vercel/output/functions/api/search.func/index.mjs');
for (const file of readdirSync('server').filter(f=>f.endsWith('.mjs')&&!f.endsWith('.test.mjs')&&!['search.mjs','dev.mjs'].includes(f))) cpSync(`server/${file}`, `.vercel/output/functions/api/search.func/${file}`);
writeFileSync('.vercel/output/functions/api/search.func/.vc-config.json', JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:true}));
writeFileSync('.vercel/output/config.json', JSON.stringify({version:3,routes:[
  {src:'/sw.js',headers:{'cache-control':'no-cache'},continue:true},
  {src:'/',headers:{'cache-control':'no-cache'},continue:true},
  {handle:'filesystem'},
  {src:'/api/search',dest:'/api/search'},
  {src:'/api/(.*)',status:404},
  {src:'/(.*)',dest:'/index.html'}
]}));
console.log('Staged Vercel Build Output API v3');
