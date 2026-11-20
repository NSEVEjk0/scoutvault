import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';

const origin=process.env.SCOUTVAULT_SITE_URL??'https://scoutvault-checks.vercel.app';
async function read(path){const response=await fetch(origin+path,{signal:AbortSignal.timeout(25000)});assert.equal(response.ok,true,`${path}: HTTP ${response.status}`);return response;}
const config=await (await read('/api/config')).json();
assert.equal(config.network,'devnet');
const local=await (await read('/api/config?demo=local')).json();
assert.equal(local.network,'localnet');assert.equal(local.settlementReady,true);
assert.equal(local.programId,config.programId);
assert.equal((await read('/listings/akoka-studio.html')).headers.get('content-type')?.includes('text/html'),true);
await read('/docs/privacy.html');await read('/demo/');await read('/.well-known/assetlinks.json');
const health=await fetch(local.apiUrl+'/api/health',{signal:AbortSignal.timeout(15000)}).then(response=>response.json());
assert.equal(health.network,'localnet');assert.equal(health.programDeployed,true);
const result={checkedAt:new Date().toISOString(),site:origin,staticRoutes:true,localDemoReady:true,
  devnetReady:config.settlementReady,networkLabels:true,programId:config.programId};
await mkdir('reports',{recursive:true});await writeFile('reports/hosted.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
