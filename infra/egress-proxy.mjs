import http from 'node:http';
import net from 'node:net';
import { validatePublicUrl } from '../server/url-security.mjs';

const server=http.createServer(async(request,response)=>{
  try{
    const {url,addresses}=await validatePublicUrl(request.url);
    if(url.protocol!=='http:'){response.writeHead(400);response.end('Use CONNECT for TLS.');return;}
    const target=addresses[0];
    const upstream=http.request({hostname:target.address,port:url.port||80,path:url.pathname+url.search,method:request.method,headers:{...request.headers,host:url.host},timeout:45000},remote=>{response.writeHead(remote.statusCode??502,remote.headers);remote.pipe(response);});
    upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502);response.end('The public page could not be reached.');});
    upstream.on('timeout',()=>upstream.destroy());request.pipe(upstream);
  }catch{response.writeHead(403);response.end('Only public web destinations are allowed.');}
});
server.on('connect',async(request,socket,head)=>{
  try{
    const {url,addresses}=await validatePublicUrl(`https://${request.url}`);
    if(url.port&&url.port!=='443')throw new Error('Only HTTPS is allowed');
    const remote=net.connect({host:addresses[0].address,port:443},()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);remote.pipe(socket);socket.pipe(remote);});
    remote.setTimeout(60000,()=>remote.destroy());remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());socket.on('close',()=>remote.destroy());
  }catch{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
});
server.maxConnections=48;server.listen(1080,'0.0.0.0',()=>console.log('Public-web egress proxy ready.'));
