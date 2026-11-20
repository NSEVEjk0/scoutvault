import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Keypair, Connection } from '@solana/web3.js';

const root=resolve(import.meta.dirname,'..');
const required=name=>{const value=process.env[name];if(!value)throw new Error(`Missing private configuration: ${name}`);return value;};
function scraperEndpoint(){
  const configured=process.env.FIRECRAWL_URL;
  if(configured&&configured!=='http://127.0.0.1:45486')return configured.replace(/\/$/,'');
  try{
    const networks=JSON.parse(execFileSync('docker',['inspect','--format','{{json .NetworkSettings.Networks}}','scoutvault-firecrawl-api-1'],{encoding:'utf8'}));
    const endpoint=Object.values(networks).find(value=>value.IPAddress);
    if(endpoint)return `http://${endpoint.IPAddress}:3002`;
  }catch{}
  return 'http://127.0.0.1:45486';
}
export const config={
  root,
  port:Number(process.env.PORT??45480),
  databaseUrl:required('DATABASE_URL'),
  jwtSecret:required('SUPABASE_JWT_SECRET'),
  anonKey:required('SUPABASE_ANON_KEY'),
  serviceRoleKey:required('SUPABASE_SERVICE_ROLE_KEY'),
  encryptionKey:Buffer.from(required('DEMO_ENCRYPTION_KEY'),'hex'),
  network:process.env.SOLANA_NETWORK??'devnet',
  rpcUrl:required('SOLANA_RPC_URL'),
  mint:required('SOLANA_MINT'),
  programId:required('SOLANA_PROGRAM_ID'),
  arbiter:required('ARBITER_WALLET'),
  apiOrigin:(process.env.PUBLIC_API_ORIGIN??'http://127.0.0.1:45480').replace(/\/$/,''),
  appOrigin:(process.env.PUBLIC_APP_ORIGIN??'http://127.0.0.1:4317').replace(/\/$/,''),
  firecrawlUrl:scraperEndpoint(),
  firecrawlKey:process.env.FIRECRAWL_API_KEY??'',
  demoEnabled:process.env.DEMO_ENABLED==='true',
  faucetEnabled:process.env.FAUCET_ENABLED==='true',
  deployer:Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(required('DEPLOYER_KEY_PATH'),'utf8')))),
};
if(!['devnet','localnet'].includes(config.network))throw new Error('This deployment only supports development networks.');
export const connection=new Connection(config.rpcUrl,'confirmed');
export async function checkNetwork(){
  const genesis=await connection.getGenesisHash();
  if(config.network==='devnet'&&!genesis.startsWith('EtWTRAB'))throw new Error('The RPC endpoint is not Solana devnet.');
  return genesis;
}
