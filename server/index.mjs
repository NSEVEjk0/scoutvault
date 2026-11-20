import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import proxy from '@fastify/http-proxy';
import staticFiles from '@fastify/static';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { config,connection,checkNetwork } from './config.mjs';
import { sql,createPhotoBucket } from './db.mjs';
import { registerAuth } from './auth.mjs';
import { registerListings } from './listings.mjs';
import { registerBounties } from './bounties.mjs';
import { PROGRAM_ID,configPda } from '../shared/chain.mjs';
import { UserError } from './errors.mjs';

export async function buildServer(){
  const app=Fastify({bodyLimit:6*1024*1024,logger:{level:'warn',redact:['req.headers.authorization','req.headers.cookie','req.body']},trustProxy:['127.0.0.1']});
  const origins=[config.appOrigin,config.apiOrigin,'http://127.0.0.1:4317','http://localhost:4317',...(process.env.ALLOWED_ORIGINS??'').split(',').filter(Boolean)];
  await app.register(cors,{origin:origins,credentials:false,methods:['GET','POST','OPTIONS']});
  await app.register(multipart,{limits:{fileSize:5*1024*1024,files:1,fields:3,fieldSize:20000}});
  await app.register(rateLimit,{max:240,timeWindow:'1 minute'});
  await app.register(proxy,{upstream:'http://127.0.0.1:45483',prefix:'/supabase/rest/v1',rewritePrefix:'/',httpMethods:['GET','POST','PATCH','PUT','DELETE','OPTIONS']});
  await app.register(proxy,{upstream:'http://127.0.0.1:45485',prefix:'/supabase/storage/v1',rewritePrefix:'/',httpMethods:['GET','POST','PATCH','PUT','DELETE','OPTIONS']});
  await app.register(proxy,{upstream:'http://127.0.0.1:45484',prefix:'/supabase/realtime/v1',rewritePrefix:'/socket',websocket:true,replyOptions:{rewriteRequestHeaders:(_request,headers)=>({...headers,'x-forwarded-host':'realtime-dev.scoutvault-realtime'})}});
  await app.register(staticFiles,{root:resolve(config.root,'public'),prefix:'/',index:false,dotfiles:'deny'});
  app.addHook('onSend',async(request,reply,payload)=>{reply.header('X-Content-Type-Options','nosniff');if(request.url.startsWith('/api/'))reply.header('Cache-Control','no-store');return payload;});
  app.setErrorHandler((error,request,reply)=>{
    if(error instanceof z.ZodError){reply.code(400).send({error:`Check ${error.issues[0]?.path.join('.')||'the request'}: ${error.issues[0]?.message||'invalid input'}`});return;}
    const status=error.statusCode??500;
    if(status>=500)app.log.warn({name:error.name,code:error.code,route:request.routeOptions.url},'Request failed');
    reply.code(status).send({error:status<500||error instanceof UserError?error.message:'ScoutVault could not complete that request. Please retry in a moment.'});
  });
  app.get('/api/config',async()=>{
    let settlementReady=false;
    try{
      const accounts=await connection.getMultipleAccountsInfo([PROGRAM_ID,configPda(),new PublicKey(config.mint)]);
      settlementReady=!!accounts[0]?.executable&&!!accounts[1]&&!!accounts[2];
    }catch{}
    return {network:config.network,rpcUrl:config.network==='localnet'?`${config.apiOrigin}/api/rpc`:config.rpcUrl,
    programId:config.programId,mint:config.mint,tokenSymbol:'TEST USDC',tokenDecimals:6,arbiterWallet:config.arbiter,
    supabaseUrl:config.network==='localnet'?'':`${config.apiOrigin}/supabase`,supabaseAnonKey:config.anonKey,apiUrl:config.apiOrigin,firecrawlEnabled:true,elevenLabsEnabled:false,
    settlementReady,demoEnabled:config.demoEnabled&&settlementReady,...(existsSync(resolve(config.root,'public/downloads/scoutvault-android.apk'))?{androidDownloadUrl:'https://github.com/NSEVEjk0/scoutvault/releases/download/v0.1.0/scoutvault-android.apk'}:{})};
  });
  app.get('/api/health',async()=>{
    await sql`select 1`;const block=await connection.getLatestBlockhash('confirmed');const program=await connection.getAccountInfo(PROGRAM_ID);
    return {ok:true,database:true,network:config.network,programDeployed:!!program?.executable,blockhash:block.blockhash};
  });
  const allowedRpc=new Set(['getLatestBlockhash','getAccountInfo','getMultipleAccounts','getBalance','getTokenAccountBalance','getTokenAccountsByOwner','sendTransaction','simulateTransaction','getSignatureStatuses','getTransaction','getBlockHeight','getSlot','getGenesisHash','getEpochSchedule']);
  app.post('/api/rpc',async(request,reply)=>{
    const body=z.object({jsonrpc:z.literal('2.0'),id:z.union([z.string(),z.number()]),method:z.string(),params:z.array(z.unknown()).optional()}).parse(request.body);
    if(!allowedRpc.has(body.method))return reply.code(400).send({error:'This RPC method is not available.'});
    const response=await fetch(config.rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    return reply.code(response.status).send(await response.json());
  });
  registerAuth(app);registerListings(app);registerBounties(app);
  return app;
}

if(process.argv[1]===import.meta.filename){
  const app=await buildServer();
  await app.listen({port:config.port,host:'127.0.0.1'});
  console.log(`ScoutVault API listening on loopback port ${config.port}`);
  try{await createPhotoBucket();console.log('Private photo storage is ready.');}catch{console.log('Photo storage is starting; run the readiness check before use.');}
  checkNetwork().then(genesis=>console.log(`Development network checked: ${genesis}`)).catch(()=>console.log('Development network could not yet be reached.'));
  const stop=async()=>{await app.close();await sql.end();process.exit(0);};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
