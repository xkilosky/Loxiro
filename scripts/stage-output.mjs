import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
rmSync('.vercel/output', {recursive:true,force:true});
mkdirSync('.vercel/output/static', {recursive:true});
cpSync('dist','.vercel/output/static',{recursive:true});
writeFileSync('.vercel/output/config.json', JSON.stringify({version:3,routes:[
  {src:'/sw.js',headers:{'cache-control':'no-cache'},continue:true},
  {src:'/',headers:{'cache-control':'no-cache'},continue:true},
  {handle:'filesystem'},
  {src:'/(.*)',dest:'/index.html'}
]}));
console.log('Staged Vercel Build Output API v3');
