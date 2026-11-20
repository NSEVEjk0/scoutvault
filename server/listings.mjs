import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.mjs';
import { preflightListing } from './url-security.mjs';
import { UserError } from './errors.mjs';
import { baselineReceipt } from './baseline-receipt.mjs';

const clean=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/\s+/g,' ').trim();
export function extractBaseline(url,data){
  const markdown=String(data.markdown??'').slice(0,120000);
  const title=clean(data.metadata?.title??markdown.match(/^#\s+(.+)/m)?.[1]??'Check this listing').slice(0,100);
  const address=clean(markdown.match(/(?:^|\n)(?:\*\*)?Address\s*:(?:\*\*)?\s*([^\n]+)/i)?.[1]??'').slice(0,180);
  const price=clean(markdown.match(/(?:^|\n)(?:\*\*)?Price\s*:(?:\*\*)?\s*([^\n]+)/i)?.[1]??markdown.match(/(?:₦|NGN\s?|USD\s?|\$)[\d,]+(?:\.\d+)?(?:\s*(?:per|\/)\s*(?:year|month|week))?/i)?.[0]??'').slice(0,100);
  const water=markdown.match(/[^\n.!?]*(?:borehole|water tank)[^\n.!?]*/i)?.[0];
  const description=clean(data.metadata?.description??markdown.split('\n').find(line=>line.length>70&&line.length<300)??'').slice(0,400);
  const warnings=[];
  if(!address)warnings.push('The page did not expose a clear address. Add the entrance address and review each question.');
  if(/demo listing|sample data/i.test(markdown))warnings.unshift('This page is a demo listing. It does not offer a real property or paid job.');
  const checklist=[
    {id:'address',question:'Is the entrance at the listed address?',sourceClaim:address||'The requester must supply an entrance address.',hint:'Find the street name and photograph the entrance.'},
    {id:'price',question:price?'Does the price match the listing?':'Is the item or place actually available?',sourceClaim:price||'Availability needs confirmation with the seller.',hint:price?'Ask what the quoted price includes.':'Ask the seller what is available today.'},
    {id:'detail',question:water?'Is the advertised water tank present?':'Does the main advertised detail match?',sourceClaim:water?clean(water).slice(0,220):description||'Edit this question to name one visible detail.',hint:water?'Check behind the building where access is permitted.':'Choose one concrete detail and describe what you see.'},
  ];
  return {url,title,description,address,price,checklist,capturedAt:new Date().toISOString(),sourceHash:createHash('sha256').update(markdown).digest('hex'),provider:'firecrawl',warnings};
}

export function registerListings(app){
  app.post('/api/listings/read',{config:{rateLimit:{max:6,timeWindow:'5 minutes'}}},async request=>{
    const {url}=z.object({url:z.string().url().max(2048)}).parse(request.body);
    const target=await preflightListing(url);
    const headers={'Content-Type':'application/json'};if(config.firecrawlKey)headers.Authorization=`Bearer ${config.firecrawlKey}`;
    let response;try{response=await fetch(`${config.firecrawlUrl}/v2/scrape`,{method:'POST',headers,body:JSON.stringify({url:target,formats:['markdown'],onlyMainContent:true,maxAge:0,timeout:45000}),signal:AbortSignal.timeout(60000)});}catch{throw new UserError('The listing reader is unavailable. Try again, or write the checks yourself.',503);}
    if(!response.ok)throw new UserError('This page could not be read. Try its public URL, or write the checks yourself.',422);
    const result=await response.json();if(!result.success||!result.data?.markdown)throw new UserError('The page did not contain readable listing text. Write the checks yourself.',422);
    const baseline=extractBaseline(target,result.data);
    return {...baseline,sourceReceipt:baselineReceipt(baseline,config.jwtSecret)};
  });
}
