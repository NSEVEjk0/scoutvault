import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { UserError } from './errors.mjs';

export function isPublicAddress(address){
  if(address.startsWith('::ffff:'))return isPublicAddress(address.slice(7));
  if(isIP(address)===4){
    const [a,b,c]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||(b===0&&(c===0||c===2))))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));
  }
  if(isIP(address)===6)return /^[23]/i.test(address)&&!/^2001:(?:db8|0):/i.test(address);
  return false;
}

export function normalizePublicUrl(value){
  let url;try{url=new URL(value);}catch{throw new UserError('Enter a complete public listing URL.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port))throw new UserError('Use a public HTTP or HTTPS page without login credentials.');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost'||/\.(?:localhost|local|internal)$/i.test(host)||isIP(host)&&!isPublicAddress(host))throw new UserError('Local and private network URLs cannot be read. Use a public listing.');
  url.hash='';return url;
}

export async function validatePublicUrl(value,dnsLookup=lookup){
  const url=normalizePublicUrl(value);const host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await dnsLookup(host,{all:true});
  if(!addresses.length||addresses.some(entry=>!isPublicAddress(entry.address)))throw new UserError('The listing resolves to a private network address. Use a public page.');
  return {url,addresses};
}

async function headAt(url,address){
  return new Promise((resolve,reject)=>{
    const transport=url.protocol==='https:'?https:http;
    const request=transport.request(url,{method:'HEAD',headers:{'User-Agent':'ScoutVault/0.1 listing preflight'},lookup:(_host,options,callback)=>options.all?callback(null,[address]):callback(null,address.address,address.family),timeout:10000},response=>{response.resume();resolve({status:response.statusCode,location:response.headers.location});});
    request.on('timeout',()=>request.destroy(new Error('Listing timeout')));request.on('error',reject);request.end();
  });
}

export async function preflightListing(value){
  let {url,addresses}=await validatePublicUrl(value);
  for(let redirects=0;redirects<5;redirects++){
    let response;try{response=await headAt(url,addresses[0]);}catch{ return url.toString(); }
    if(![301,302,303,307,308].includes(response.status)||!response.location)return url.toString();
    const next=new URL(response.location,url);({url,addresses}=await validatePublicUrl(next.toString()));
  }
  throw new UserError('The listing redirects too many times. Paste its final public URL.');
}
