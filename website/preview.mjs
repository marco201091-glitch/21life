import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('./dist/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.xml':'application/xml; charset=utf-8'};
http.createServer((request,response)=>{
 try{
 const requested=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
 let file=path.resolve(root,'.'+requested);
 if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){response.statusCode=404;file=path.join(root,'404.html')}
 response.setHeader('Content-Type',mime[path.extname(file)]||'text/plain; charset=utf-8');
 response.setHeader('X-Content-Type-Options','nosniff');
 response.end(fs.readFileSync(file));
 }catch{response.writeHead(400);response.end('Bad request')}
}).listen(Number(process.env.PORT||4319),'127.0.0.1',()=>console.log('21Life local preview port: '+(process.env.PORT||4319)));
