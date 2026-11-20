import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { canonicalJson } from '../shared/canonical.ts';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const sharpModule=require('sharp');const sharp=sharpModule.default??sharpModule;

const origin=process.env.SCOUTVAULT_TEST_API??'http://127.0.0.1:45580';
async function call(path,body,session){
  const response=await fetch(origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{...(body&&! (body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session.token}:{})},...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw new Error(`${path}: ${response.status} ${data.error}`);return data;
}
const saved=JSON.parse(await readFile('.local/test-demo.json','utf8'));
const sessions=await call('/demo/session',{demoId:saved.demoId});
await writeFile('.local/test-demo.json',JSON.stringify(sessions),{mode:0o600});
const buyer=sessions.buyer,scout=sessions.scout;
const config=await call('/config');if(config.network!=='localnet')throw new Error('This test only writes to the isolated local test network.');
const baseline={url:'https://example.com',title:'Check the sample Akoka studio',description:'A demo studio listing with an entrance and water tank.',address:'12 Sample Lane, Akoka',price:'₦1,200,000 per year',provider:'manual',sourceHash:createHash('sha256').update('demo studio').digest('hex'),capturedAt:new Date().toISOString(),warnings:['Demo listing'],checklist:[
  {id:'address',question:'Is the entrance at the listed address?',sourceClaim:'12 Sample Lane',hint:'Check the entrance.'},
  {id:'price',question:'Does the price match the listing?',sourceClaim:'₦1,200,000 per year',hint:'Ask what the price includes.'},
  {id:'water',question:'Is the water tank behind the building?',sourceClaim:'Water tank behind the building',hint:'Look where access is permitted.'},
]};
async function confirm(prepared,session){const {signature}=await call('/demo/sign',{preparedId:prepared.preparedId},session);return call(`/bounties/${prepared.id}/confirm`,{preparedId:prepared.preparedId,signature},session);}
let bounty=await confirm(await call('/bounties/prepare',{baseline,title:baseline.title,address:baseline.address,area:'Akoka, Lagos',category:'housing',latitude:6.5184,longitude:3.3859,reward:'2',expiresAt:new Date(Date.now()+3600000).toISOString()},buyer),buyer);
const publicCopy=await call('/bounties/'+bounty.id);
if(publicCopy.address||publicCopy.latitude!==6.518)throw new Error('The public feed exposed precise location data.');
const balanceBefore=await call('/wallet/balance',undefined,scout);
bounty=await confirm(await call(`/bounties/${bounty.id}/claim`,{},scout),scout);
const challenge=await call(`/bounties/${bounty.id}/challenge`,undefined,scout);
const photo=await sharp(await readFile('public/demo/sample-check.svg')).jpeg({quality:85}).toBuffer();
const manifest={version:1,bountyId:bounty.id,chainId:bounty.chainId,scoutWallet:scout.wallet,challenge:challenge.nonce,code:challenge.code,
  photoHash:createHash('sha256').update(photo).digest('hex'),capturedAt:new Date().toISOString(),captureSource:'demo-sample',latitude:bounty.latitude,longitude:bounty.longitude,accuracyMeters:10,
  answers:{address:'yes',price:'yes',water:'unclear'},note:'This is a sample illustration, not a site visit. The flow tests the signed report and token payout.'};
const message=canonicalJson(manifest);const {signature}=await call('/demo/sign-message',{message},scout);
const form=new FormData();form.set('manifest',message);form.set('signature',signature);form.set('photo',new Blob([photo],{type:'image/jpeg'}),'sample.jpg');
bounty=await confirm(await call(`/bounties/${bounty.id}/reports/prepare`,form,scout),scout);
const review=await call('/bounties/'+bounty.id,undefined,buyer);
if(!review.report?.manifestHash)throw new Error('The buyer could not read the signed report.');
const blocked=await fetch(review.report.photoUrl);if(blocked.status!==401)throw new Error('Anonymous photo access was not blocked.');
const image=await fetch(review.report.photoUrl,{headers:{Authorization:'Bearer '+buyer.token}});
const imageHash=createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex');
if(imageHash!==manifest.photoHash)throw new Error('Stored photo bytes do not match the signed hash.');
bounty=await confirm(await call(`/bounties/${bounty.id}/approve`,{expectedManifestHash:review.report.manifestHash},buyer),buyer);
const balanceAfter=await call('/wallet/balance',undefined,scout);
if(bounty.status!=='paid'||balanceAfter.tokens-balanceBefore.tokens!==2)throw new Error('The escrow did not pay the exact bounty.');
const result={network:config.network,passed:true,bountyId:bounty.id,scoutPayout:2,token:'TEST USDC',checks:['funded escrow','private location redaction','claim','signed camera-report bytes','anonymous photo blocked','stored photo hash preserved','exact report approval','exact token balance increase'],fundingSignature:bounty.fundingSignature,reportSignature:bounty.reportSignature,payoutSignature:bounty.payoutSignature};
await writeFile('reports/api-flow.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
