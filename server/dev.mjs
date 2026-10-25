import { createServer } from 'node:http';
import handler from './search.mjs';
createServer((req,res)=>{if(new URL(req.url,'http://localhost').pathname==='/api/search')void handler(req,res);else {res.statusCode=404;res.end();}}).listen(8787,'0.0.0.0',()=>console.log('Search API listening on 8787'));
