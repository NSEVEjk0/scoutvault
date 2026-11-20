import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { SignJWT,jwtVerify } from 'jose';
import { PublicKey,Keypair,SystemProgram,Transaction,sendAndConfirmTransaction } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount,mintTo } from '@solana/spl-token';
import nacl from 'tweetnacl';
import { z } from 'zod';
import { config,connection } from './config.mjs';
import { sql } from './db.mjs';
import { requireCondition,UserError } from './errors.mjs';

const jwtKey=new TextEncoder().encode(config.jwtSecret);
export const publicKey=z.string().min(32).max(44).refine(value=>{try{return PublicKey.isOnCurve(new PublicKey(value).toBytes());}catch{return false;}},'Use a valid signing wallet address.');

function subject(wallet){const hash=createHash('sha256').update(wallet).digest('hex');return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;}
export async function issueSession(wallet,isDemo=false,demoId){
  const expires=Math.floor(Date.now()/1000)+3600;
  const token=await new SignJWT({role:'authenticated',wallet,isDemo,...(demoId?{demoId}:{})})
    .setProtectedHeader({alg:'HS256'}).setSubject(subject(wallet)).setIssuer('scoutvault').setAudience('authenticated').setIssuedAt().setExpirationTime(expires).sign(jwtKey);
  return {token,wallet,isDemo,expiresAt:new Date(expires*1000).toISOString()};
}

export async function optionalSession(request){
  const header=request.headers.authorization;
  if(!header)return null;
  if(!header.startsWith('Bearer '))throw new UserError('Reconnect your wallet to continue.',401);
  try{
    const {payload}=await jwtVerify(header.slice(7),jwtKey,{issuer:'scoutvault',audience:'authenticated',algorithms:['HS256']});
    if(typeof payload.wallet!=='string')throw new Error('Invalid wallet');
    return payload;
  }catch{throw new UserError('Your wallet session has expired. Reconnect to continue.',401);}
}
export async function requireSession(request){const session=await optionalSession(request);requireCondition(session,'Connect your wallet first.',401);return session;}

export function encryptKey(key){
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',config.encryptionKey,iv);
  const encrypted=Buffer.concat([cipher.update(Buffer.from(key)),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');
}
function decryptKey(value){const bytes=Buffer.from(value,'base64');const decipher=createDecipheriv('aes-256-gcm',config.encryptionKey,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);}

export async function demoSigner(session){
  requireCondition(session.isDemo===true&&typeof session.demoId==='string','This action needs a demo session.',403);
  const rows=await sql`select * from sv_demo_sessions where id=${session.demoId}`;
  requireCondition(rows.length,'Start a new demo session.',401);
  const row=rows[0];
  const encrypted=session.wallet===row.buyer_wallet?row.buyer_key_encrypted:session.wallet===row.scout_wallet?row.scout_key_encrypted:null;
  requireCondition(encrypted,'This wallet does not belong to the demo.',403);
  return Keypair.fromSecretKey(new Uint8Array(decryptKey(encrypted)));
}

export async function giveTestFunds(wallet){
  requireCondition(config.faucetEnabled,'Test funding is not enabled.',503);
  const recipient=new PublicKey(wallet);
  const balance=await connection.getBalance(config.deployer.publicKey);
  const needed=config.network==='localnet'?20000000:14000000;
  requireCondition(balance>needed+10000000,'The test faucet is waiting for devnet SOL. You can fund your wallet through faucet.solana.com and retry.',503);
  if(await connection.getBalance(recipient)<10000000){
    await sendAndConfirmTransaction(connection,new Transaction().add(SystemProgram.transfer({fromPubkey:config.deployer.publicKey,toPubkey:recipient,lamports:needed})),[config.deployer],{commitment:'confirmed'});
  }
  const ata=await getOrCreateAssociatedTokenAccount(connection,config.deployer,new PublicKey(config.mint),recipient);
  await mintTo(connection,config.deployer,new PublicKey(config.mint),ata.address,config.deployer,10_000_000);
}

export function registerAuth(app){
  app.post('/api/auth/challenge',{config:{rateLimit:{max:20,timeWindow:'5 minutes'}}},async request=>{
    const {wallet}=z.object({wallet:publicKey}).parse(request.body);
    const nonce=randomBytes(24).toString('base64url');const expires=new Date(Date.now()+5*60000);
    const message=`Sign in to ScoutVault\nDomain: ${new URL(config.appOrigin).host}\nWallet: ${wallet}\nNetwork: ${config.network}\nNonce: ${nonce}\nExpires: ${expires.toISOString()}\nThis signs a login message, not a token transfer.`;
    await sql`insert into sv_challenges(nonce,kind,wallet,message,expires_at) values(${nonce},'auth',${wallet},${message},${expires})`;
    return {nonce,message,expiresAt:expires.toISOString()};
  });
  app.post('/api/auth/verify',async request=>{
    const {wallet,nonce,signature}=z.object({wallet:publicKey,nonce:z.string().min(24).max(80),signature:z.string().min(80).max(100)}).parse(request.body);
    await sql.begin(async tx=>{
      const rows=await tx`select * from sv_challenges where nonce=${nonce} and kind='auth' and wallet=${wallet} for update`;
      requireCondition(rows.length&&rows[0].expires_at>new Date()&&!rows[0].used_at,'This sign-in request has expired. Please reconnect.',401);
      const bytes=Buffer.from(signature,'base64');
      requireCondition(bytes.length===64&&nacl.sign.detached.verify(new TextEncoder().encode(rows[0].message),new Uint8Array(bytes),new PublicKey(wallet).toBytes()),'The wallet signature could not be verified.',401);
      await tx`update sv_challenges set used_at=now() where nonce=${nonce}`;
    });
    return issueSession(wallet);
  });
  app.post('/api/demo/session',{config:{rateLimit:{max:config.network==='localnet'&&process.env.SCOUTVAULT_TEST_MODE==='true'?1000:4,timeWindow:'1 hour'}}},async request=>{
    requireCondition(config.demoEnabled,'The demo wallet is not enabled.',503);
    const {demoId}=z.object({demoId:z.string().min(32).max(100).nullable().optional()}).parse(request.body??{});
    let row;
    if(demoId){const rows=await sql`select * from sv_demo_sessions where id=${demoId}`;row=rows[0];}
    if(!row){
      const buyer=Keypair.generate(),scout=Keypair.generate(),id=randomBytes(32).toString('base64url');
      await giveTestFunds(buyer.publicKey.toBase58());await giveTestFunds(scout.publicKey.toBase58());
      [row]=await sql`insert into sv_demo_sessions(id,buyer_wallet,scout_wallet,buyer_key_encrypted,scout_key_encrypted)
        values(${id},${buyer.publicKey.toBase58()},${scout.publicKey.toBase58()},${encryptKey(buyer.secretKey)},${encryptKey(scout.secretKey)}) returning *`;
    }
    return {demoId:row.id,buyer:await issueSession(row.buyer_wallet,true,row.id),scout:await issueSession(row.scout_wallet,true,row.id)};
  });
  app.post('/api/demo/sign-message',async request=>{
    const session=await requireSession(request);const {message}=z.object({message:z.string().min(10).max(10000)}).parse(request.body);
    let manifest;try{manifest=JSON.parse(message);}catch{throw new UserError('Only a field report can be signed by the demo wallet.');}
    requireCondition(manifest.scoutWallet===session.wallet&&typeof manifest.bountyId==='string'&&typeof manifest.challenge==='string','This is not a report for your demo wallet.',403);
    const rows=await sql`select id from sv_bounties where id=${manifest.bountyId} and scout_wallet=${session.wallet} and status in ('claimed','submitted')`;
    requireCondition(rows.length,'Claim this check before signing its report.',403);
    const key=await demoSigner(session);return {signature:Buffer.from(nacl.sign.detached(new TextEncoder().encode(message),key.secretKey)).toString('base64')};
  });
  app.get('/api/wallet/balance',async request=>{
    const session=await requireSession(request);const wallet=new PublicKey(session.wallet);
    const sol=await connection.getBalance(wallet);let tokens=0;
    const accounts=await connection.getParsedTokenAccountsByOwner(wallet,{mint:new PublicKey(config.mint)});
    for(const account of accounts.value)tokens+=Number(account.account.data.parsed.info.tokenAmount.uiAmountString);
    return {sol:sol/1e9,tokens};
  });
  app.post('/api/wallet/faucet',{config:{rateLimit:{max:3,timeWindow:'1 hour'}}},async request=>{
    const session=await requireSession(request);
    await sql.begin(async tx=>{
      const [existing]=await tx`select granted_at from sv_faucet_uses where wallet=${session.wallet} for update`;
      requireCondition(!existing||Date.now()-existing.granted_at.getTime()>3600000,'You can request more test tokens after one hour.',429);
      await giveTestFunds(session.wallet);
      await tx`insert into sv_faucet_uses(wallet) values(${session.wallet}) on conflict(wallet) do update set granted_at=now()`;
    });
    return {success:true,token:'TEST USDC',amount:10,network:config.network};
  });
}
