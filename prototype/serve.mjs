// ClassDesk local preview server. No dependencies or outgoing network requests.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const port=Number(process.env.PORT||5178);
const host=process.env.HOST||'127.0.0.1';
createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const requested=pathname==='/'?'settings.html':pathname.replace(/^\/+/, '');
    const file=resolve(root,requested);
    if(!file.startsWith(resolve(root)+sep)){res.writeHead(403).end('Forbidden');return;}
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
  }catch(error){res.writeHead(error instanceof URIError?400:404,{'Content-Type':'text/plain; charset=utf-8'}).end('Not found');}
}).listen(port,host,()=>console.log(`교실데스크 미리보기 http://${host}:${port}/`));
