import { readFile,writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import postgres from '../server/node_modules/postgres/src/index.js';

const original=await readFile('.local/deployment.env','utf8');
const values=Object.fromEntries(original.trim().split('\n').map(line=>line.split(/=(.*)/s).slice(0,2)));
const sql=postgres(values.DATABASE_URL,{max:1});
const exists=await sql`select 1 from pg_database where datname='scoutvault_test'`;
if(!exists.length)await sql.unsafe('CREATE DATABASE scoutvault_test');
await sql.end();
if(!exists.length){
  const source=(await readFile('infra/schema.sql','utf8')).split('\n').filter(line=>!line.startsWith('\\getenv')&&!line.includes('PASSWORD :')).join('\n');
  const result=spawnSync('docker',['exec','-i','scoutvault-db','psql','-U','postgres','-d','scoutvault_test','-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr);
}
const overrides={PORT:'45580',SOLANA_NETWORK:'localnet',SOLANA_RPC_URL:'http://127.0.0.1:45489',DATABASE_URL:values.DATABASE_URL.replace(/\/postgres$/,'/scoutvault_test'),PUBLIC_API_ORIGIN:'http://127.0.0.1:45580',SCOUTVAULT_TEST_MODE:'true'};
for(const [key,value]of Object.entries(overrides))values[key]=value;
await writeFile('.local/local-test.env',Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
console.log('Isolated test database and local-validator configuration are ready.');
