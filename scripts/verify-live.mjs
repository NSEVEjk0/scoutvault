import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';

const origin=process.env.SCOUTVAULT_SITE_URL??'https://scoutvault-checks.vercel.app';
async function read(path){const response=await fetch(origin+path,{signal:AbortSignal.timeout(25000)});assert.equal(response.ok,true,`${path}: HTTP ${response.status}`);return response;}
const config=await (await read('/api/config')).json();
assert.equal(config.network,'devnet');
const localResponse=await fetch(origin+'/api/config?demo=local',{signal:AbortSignal.timeout(25000)});
const localRetired=localResponse.status===410;
if(localRetired){
  const message=await localResponse.json();
  assert.match(message.error,/local payment demo has ended/i);
  const redirect=await fetch(origin+'/?demo=local',{redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert.ok([302,307].includes(redirect.status));
  assert.equal(new URL(redirect.headers.get('location'),origin).pathname.replace(/\/$/,''),'/demo');
}else{
  assert.equal(localResponse.ok,true,`local configuration: HTTP ${localResponse.status}`);
  const local=await localResponse.json();
  assert.equal(local.network,'localnet');assert.equal(local.settlementReady,true);
  assert.equal(local.programId,config.programId);
  const localHealth=await fetch(local.apiUrl+'/api/health',{signal:AbortSignal.timeout(15000)}).then(response=>response.json());
  assert.equal(localHealth.network,'localnet');assert.equal(localHealth.programDeployed,true);
}
assert.equal((await read('/listings/akoka-studio.html')).headers.get('content-type')?.includes('text/html'),true);
await read('/docs/privacy.html');await read('/demo/');await read('/.well-known/assetlinks.json');
const health=await fetch(config.apiUrl+'/api/health',{signal:AbortSignal.timeout(15000)}).then(response=>response.json());
assert.equal(health.network,'devnet');assert.equal(health.ok,true);
const result={checkedAt:new Date().toISOString(),site:origin,staticRoutes:true,localDemoReady:!localRetired,localDemoRetired:localRetired,
  devnetReady:config.settlementReady,networkLabels:true,programId:config.programId};
await mkdir('reports',{recursive:true});await writeFile('reports/hosted.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
