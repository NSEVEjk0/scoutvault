import { randomBytes, createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = resolve('.local');
await mkdir(resolve(base,'supabase'),{recursive:true,mode:0o700});
const revision='fbd1e34128b7f1afe53d7a721272eb781469de35';
const files={
  'realtime.sql':'docker/volumes/db/realtime.sql',
  'roles.sql':'docker/volumes/db/roles.sql',
  'jwt.sql':'docker/volumes/db/jwt.sql',
  '_supabase.sql':'docker/volumes/db/_supabase.sql',
  'realtime-entrypoint.sh':'docker/volumes/realtime/docker-entrypoint.sh',
};
for(const [name,path] of Object.entries(files)){
  const response=await fetch(`https://raw.githubusercontent.com/supabase/supabase/${revision}/${path}`);
  if(!response.ok)throw new Error(`Could not read the pinned Supabase file ${name}`);
  await writeFile(resolve(base,'supabase',name),await response.text());
}
const envPath=resolve(base,'deployment.env');
try { await readFile(envPath); console.log('Existing private infrastructure configuration retained.'); }
catch(error){
  if(error.code!=='ENOENT')throw error;
  const secret=randomBytes(48).toString('hex');
  const password=randomBytes(32).toString('hex');
  const jwt=(role)=>{
    const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+10*365*86400})).toString('base64url');
    return `${header}.${payload}.${createHmac('sha256',secret).update(`${header}.${payload}`).digest('base64url')}`;
  };
  const addresses=JSON.parse(await readFile(resolve(base,'public-addresses.json'),'utf8'));
  const values={
    POSTGRES_PASSWORD:password,SCOUTVAULT_FIRECRAWL_DB_PASSWORD:randomBytes(32).toString('hex'),SUPABASE_JWT_SECRET:secret,SUPABASE_ANON_KEY:jwt('anon'),SUPABASE_SERVICE_ROLE_KEY:jwt('service_role'),
    DATABASE_URL:`postgres://postgres:${password}@127.0.0.1:45482/postgres`,
    REALTIME_DB_ENC_KEY:randomBytes(24).toString('base64url').slice(0,16),REALTIME_SECRET_KEY_BASE:randomBytes(64).toString('hex'),
    DEMO_ENCRYPTION_KEY:randomBytes(32).toString('hex'),
    SOLANA_RPC_URL:'https://api.devnet.solana.com',SOLANA_NETWORK:'devnet',SOLANA_MINT:addresses.mint,SOLANA_PROGRAM_ID:addresses.program,
    ARBITER_WALLET:addresses.deployer,DEPLOYER_KEY_PATH:resolve(base,'keys/deployer-keypair.json'),MINT_KEY_PATH:resolve(base,'keys/mint-keypair.json'),
    FIRECRAWL_URL:'http://127.0.0.1:45486',FIRECRAWL_API_KEY:'',
    PUBLIC_API_ORIGIN:'http://127.0.0.1:45480',PUBLIC_APP_ORIGIN:'http://127.0.0.1:4317',
    PORT:'45480',DEMO_ENABLED:'true',FAUCET_ENABLED:'true',
  };
  await writeFile(envPath,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
  console.log('Private configuration created. No credentials were printed.');
}
await chmod(envPath,0o600);
console.log(`Pinned Supabase infrastructure source: ${revision}`);
