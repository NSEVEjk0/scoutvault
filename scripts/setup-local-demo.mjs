import { readFile,writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import postgres from '../server/node_modules/postgres/src/index.js';

const source=await readFile('.local/deployment.env','utf8');
const values=Object.fromEntries(source.trim().split('\n').map(line=>line.split(/=(.*)/s).slice(0,2)));
const sql=postgres(values.DATABASE_URL,{max:1});
const exists=await sql`select 1 from pg_database where datname='scoutvault_demo'`;
if(!exists.length)await sql.unsafe('CREATE DATABASE scoutvault_demo');
await sql.end();
if(!exists.length){
  const schema=(await readFile('infra/schema.sql','utf8')).split('\n').filter(line=>!line.startsWith('\\getenv')&&!line.includes('PASSWORD :')).join('\n');
  const result=spawnSync('docker',['exec','-i','scoutvault-db','psql','-U','postgres','-d','scoutvault_demo','-v','ON_ERROR_STOP=1'],{input:schema,encoding:'utf8'});
  if(result.status!==0)throw new Error('The separate demo database could not be initialized.');
}
let apiOrigin='http://127.0.0.1:45581';
try{apiOrigin=Object.fromEntries((await readFile('.local/local-demo.env','utf8')).trim().split('\n').map(line=>line.split(/=(.*)/s).slice(0,2))).PUBLIC_API_ORIGIN??apiOrigin;}catch{}
Object.assign(values,{PORT:'45581',SOLANA_NETWORK:'localnet',SOLANA_RPC_URL:'http://127.0.0.1:45489',
  DATABASE_URL:values.DATABASE_URL.replace(/\/postgres$/,'/scoutvault_demo'),PUBLIC_API_ORIGIN:apiOrigin,
  PUBLIC_APP_ORIGIN:'https://scoutvault-checks.vercel.app',ALLOWED_ORIGINS:'https://explorer.solana.com,http://127.0.0.1:4317',
  DEMO_ENABLED:'true',FAUCET_ENABLED:'true'});
delete values.SCOUTVAULT_TEST_MODE;
await writeFile('.local/local-demo.env',Object.entries(values).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600});
console.log('The local demo has a separate database and explicit local-network configuration.');
