import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { PublicKey,Transaction,sendAndConfirmTransaction } from '@solana/web3.js';
import { z } from 'zod';
import sharp from 'sharp';
import nacl from 'tweetnacl';
import { canonicalJson } from '../shared/canonical.ts';
import { actionInstruction,accountsFor,buyerRecordPda,createInstruction,buildTransaction,decodeBuyerRecord,decodeEscrow,escrowPda,parseEvents,PROGRAM_ID } from '../shared/chain.mjs';
import { config,connection } from './config.mjs';
import { sql,storage,loadBounty,publishBounty,publicBounty } from './db.mjs';
import { requireSession,optionalSession,demoSigner } from './auth.mjs';
import { requireCondition,UserError } from './errors.mjs';
import { validatePublicUrl } from './url-security.mjs';
import { verifyBaselineReceipt } from './baseline-receipt.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const bytes=value=>Buffer.from(value,'hex');
const idSchema=z.string().uuid();
const hashSchema=z.string().regex(/^[a-f0-9]{64}$/);
const checkSchema=z.object({id:z.string().regex(/^[a-z0-9_-]{1,30}$/),question:z.string().min(8).max(180),sourceClaim:z.string().max(500),hint:z.string().max(250)});
const baselineSchema=z.object({url:z.string().url().max(2048),title:z.string().max(100),description:z.string().max(500),address:z.string().max(180),price:z.string().max(100),checklist:z.array(checkSchema).min(1).max(5),capturedAt:z.string().datetime(),sourceHash:hashSchema,provider:z.enum(['firecrawl','manual']),sourceReceipt:z.string().max(100).optional(),warnings:z.array(z.string().max(500)).max(5)});
const createSchema=z.object({baseline:baselineSchema,title:z.string().trim().min(8).max(100),address:z.string().trim().min(5).max(180),area:z.string().trim().min(2).max(80),category:z.enum(['housing','shop','campus']),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),reward:z.string().regex(/^\d+(?:\.\d{1,6})?$/),expiresAt:z.string().datetime()});
const manifestSchema=z.object({version:z.literal(1),bountyId:idSchema,chainId:z.string().regex(/^\d+$/),scoutWallet:z.string().min(32).max(44),challenge:z.string().min(24).max(80),code:z.string().max(20),photoHash:hashSchema,capturedAt:z.string().datetime(),captureSource:z.enum(['web-camera','android-camera','demo-sample']),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),accuracyMeters:z.number().min(0).max(250),answers:z.record(z.string(),z.enum(['yes','no','unclear'])),note:z.string().max(1200)}).strict();

export function distanceMeters(lat1,lng1,lat2,lng2){const radians=Math.PI/180;const a=Math.sin((lat2-lat1)*radians/2)**2+Math.cos(lat1*radians)*Math.cos(lat2*radians)*Math.sin((lng2-lng1)*radians/2)**2;return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}

async function privateBounty(id){const [row]=await sql`select * from sv_bounties where id=${id}`;requireCondition(row,'This check was not found.',404);return row;}
async function requireChainEscrow(bounty){const account=await connection.getAccountInfo(new PublicKey(bounty.escrowAddress),'confirmed');requireCondition(account&&account.owner.equals(PROGRAM_ID),'The funded escrow could not be read. Wait for confirmation and retry.',409);return decodeEscrow(account.data);}

async function storePrepared(bounty,session,action,ix,extra={}){
  const transaction=await buildTransaction(connection,session.wallet,ix);
  const preparedId=randomUUID();const expires=new Date(Date.now()+10*60000);
  await sql`insert into sv_prepared(id,bounty_id,wallet,action,data,expires_at) values(${preparedId},${bounty.id},${session.wallet},${action},${sql.json({...transaction,...extra})},${expires})`;
  return {id:bounty.id,preparedId,...transaction};
}

async function transactionEvent(signature,eventName,bounty,session,prepared){
  let transaction;
  for(let attempt=0;attempt<12;attempt++){
    transaction=await connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
    if(transaction)break;
    await new Promise(resolve=>setTimeout(resolve,700));
  }
  requireCondition(transaction,'The network has not confirmed this transaction yet. Wait a moment and retry.',409);
  requireCondition(transaction.meta&&!transaction.meta.err,'The transaction failed. No escrow change was recorded.',409);
  const keys=transaction.transaction.message.getAccountKeys().staticAccountKeys;
  const signers=keys.slice(0,transaction.transaction.message.header.numRequiredSignatures);
  requireCondition(signers.some(key=>key.toBase58()===session.wallet),'This transaction was not signed by your wallet.',403);
  if(transaction.blockTime)requireCondition(transaction.blockTime*1000>=prepared.created_at.getTime()-120000,'This receipt predates the prepared action.',409);
  const events=parseEvents(transaction.meta.logMessages);
  const event=events.find(event=>event.name===eventName&&event.data.escrow?.toBase58()===bounty.escrowAddress&&event.data.bounty_id?.toString()===bounty.chainId);
  requireCondition(event,'The transaction does not contain the expected ScoutVault action.',409);
  return event.data;
}

export function registerBounties(app){
  app.get('/api/bounties',async request=>{
    const session=await optionalSession(request);
    const query=z.object({lat:z.coerce.number().min(-90).max(90).optional(),lng:z.coerce.number().min(-180).max(180).optional(),radius:z.coerce.number().min(1).max(2000).default(2000)}).parse(request.query);
    let rows;
    if(query.lat!==undefined&&query.lng!==undefined)rows=await sql`select data,distance_m from nearby_bounties(${query.lat},${query.lng},${query.radius})`;
    else rows=await sql`select data from public_bounties order by created_at desc limit 100`;
    let bounties=rows.map(row=>({...row.data,...(row.distance_m!==undefined?{distanceMeters:Number(row.distance_m)}:{})}));
    if(session){
      const own=await sql`select data from sv_bounties where status<>'draft' and (buyer_wallet=${session.wallet} or scout_wallet=${session.wallet}) order by created_at desc limit 100`;
      const map=new Map(bounties.map(item=>[item.id,item]));for(const row of own)map.set(row.data.id,{...map.get(row.data.id),...row.data});bounties=Array.from(map.values());
    }
    const [count]=await sql`select count(*)::int as count from sv_bounties where status='paid'`;
    return {bounties,paidCount:count.count};
  });
  app.get('/api/bounties/:id',async request=>{
    const id=idSchema.parse(request.params.id);const session=await optionalSession(request);const bounty=await loadBounty(id,session);
    requireCondition(bounty,'This check was not found.',404);return bounty;
  });

  app.post('/api/bounties/prepare',async request=>{
    const session=await requireSession(request);const value=createSchema.parse(request.body);
    requireCondition(new Set(value.baseline.checklist.map(check=>check.id)).size===value.baseline.checklist.length,'Each checklist item needs its own id.');
    requireCondition(value.baseline.provider!=='firecrawl'||verifyBaselineReceipt(value.baseline,config.jwtSecret),'The captured listing was changed. Read it again, or use a requester-written checklist.');
    await validatePublicUrl(value.baseline.url);
    const reward=Number(value.reward);requireCondition(reward>=0.5&&reward<=25,'Choose a bounty between 0.5 and 25 test tokens.');
    const expiry=new Date(value.expiresAt);requireCondition(expiry>Date.now()&&expiry.getTime()<=Date.now()+7*86400000,'Choose an expiry within the next seven days.');
    const buyerRecord=await connection.getAccountInfo(buyerRecordPda(session.wallet));
    const previous=buyerRecord?BigInt(decodeBuyerRecord(buyerRecord.data).last_id.toString()):0n;
    const candidate=BigInt(Date.now())*1000n+BigInt(Math.floor(Math.random()*1000));
    const chainId=(candidate>previous?candidate:previous+1n).toString();
    const id=randomUUID();
    const bounty={id,chainId,title:value.title,description:value.baseline.description,category:value.category,area:value.area,address:value.address,
      latitude:value.latitude,longitude:value.longitude,reward:value.reward,tokenSymbol:'TEST USDC',status:'open',buyerWallet:session.wallet,
      createdAt:new Date().toISOString(),expiresAt:value.expiresAt,checklist:value.baseline.checklist,baseline:value.baseline,
      escrowAddress:escrowPda(session.wallet,chainId).toBase58(),fundingSignature:'',isDemo:session.isDemo===true};
    const listingHash=digest(canonicalJson({baseline:value.baseline,address:value.address,latitude:value.latitude,longitude:value.longitude,checklist:value.baseline.checklist}));
    await sql`insert into sv_bounties(id,chain_id,buyer_wallet,escrow_address,status,data,expires_at) values(${id},${chainId},${session.wallet},${bounty.escrowAddress},'draft',${sql.json(bounty)},${expiry})`;
    const instruction=createInstruction({buyer:session.wallet,mint:config.mint,id:chainId,amount:Math.round(reward*1e6),expiresAt:Math.floor(expiry.getTime()/1000),listingHash:bytes(listingHash)});
    const result=await storePrepared(bounty,session,'create',instruction,{listingHash});
    const escrowRent=await connection.getMinimumBalanceForRentExemption(276);
    const vaultRent=await connection.getMinimumBalanceForRentExemption(165);
    const recordRent=buyerRecord?0:await connection.getMinimumBalanceForRentExemption(49);
    return {...result,estimatedFeeSol:0.000005,estimatedRentSol:(escrowRent+vaultRent+recordRent)/1e9};
  });

  for(const action of ['claim','approve','refund','dispute'])app.post(`/api/bounties/:id/${action}`,async request=>{
    const session=await requireSession(request);const id=idSchema.parse(request.params.id);const row=await privateBounty(id);const bounty=row.data;
    const chain=await requireChainEscrow(bounty);
    let extra={};let hash;
    if(action==='claim'){
      requireCondition(chain.status===0,'Someone has already claimed this check.',409);
      requireCondition(bounty.buyerWallet!==session.wallet,'You cannot claim your own check. Switch to the demo scout or use a different wallet.');
    }else{
      requireCondition(bounty.buyerWallet===session.wallet,'Only this check’s buyer can do that.',403);
      if(action==='approve'){
        requireCondition(chain.status===2,'A report must be submitted before payment.',409);
        const {expectedManifestHash}=z.object({expectedManifestHash:hashSchema}).parse(request.body);
        requireCondition(Buffer.from(chain.proof_hash).toString('hex')===expectedManifestHash,'The scout updated the report. Review the latest version before paying.',409);
        const reports=await sql`select id from sv_reports where bounty_id=${id} and manifest_hash=${expectedManifestHash} and chain_signature is not null`;
        requireCondition(reports.length,'Load the submitted report before approving payment.',409);
        hash=bytes(expectedManifestHash);extra={expectedManifestHash};
      }
      if(action==='refund')requireCondition(chain.status===0||chain.status===1&&Number(chain.expires_at.toString())<=Date.now()/1000,'A submitted report must be reviewed rather than refunded.',409);
      if(action==='dispute'){
        requireCondition(chain.status===2,'Only a submitted report can be disputed.',409);
        const {reason}=z.object({reason:z.string().trim().min(10).max(1200)}).parse(request.body);
        hash=bytes(digest(reason));extra={reason,reasonHash:hash.toString('hex')};
      }
    }
    const ix=actionInstruction(action,{...bounty,mint:config.mint,arbiterWallet:config.arbiter,actorWallet:session.wallet},hash);
    return storePrepared(bounty,session,action,ix,extra);
  });

  app.get('/api/bounties/:id/challenge',async request=>{
    const session=await requireSession(request);const id=idSchema.parse(request.params.id);const row=await privateBounty(id);
    requireCondition(row.scout_wallet===session.wallet&&['claimed','submitted'].includes(row.status),'Claim this check before capturing its report.',403);
    const nonce=randomBytes(24).toString('base64url');const code=`SV-${randomBytes(3).toString('hex').toUpperCase()}`;const expires=new Date(Date.now()+5*60000);
    const instruction=`Include ${code} on a handwritten card in the photo. Capture the entrance or requested feature where photography is permitted.`;
    await sql`insert into sv_challenges(nonce,kind,wallet,bounty_id,message,code,expires_at) values(${nonce},'capture',${session.wallet},${id},${instruction},${code},${expires})`;
    return {nonce,code,instruction,message:instruction,expiresAt:expires.toISOString()};
  });

  app.post('/api/bounties/:id/reports/prepare',async request=>{
    const session=await requireSession(request);const id=idSchema.parse(request.params.id);const row=await privateBounty(id);const bounty=row.data;
    requireCondition(row.scout_wallet===session.wallet&&['claimed','submitted'].includes(row.status),'Only the assigned scout can send a report.',403);
    let manifestText,signature,photo;
    for await(const part of request.parts()){
      if(part.type==='file'){
        requireCondition(part.fieldname==='photo'&&!photo,'Attach one camera photo.');
        photo=await part.toBuffer();requireCondition(!part.file.truncated,'The photo is too large. Take a smaller photo.');
      }else if(part.fieldname==='manifest')manifestText=String(part.value);
      else if(part.fieldname==='signature')signature=String(part.value);
    }
    requireCondition(photo&&photo.length>100&&manifestText&&manifestText.length<15000&&signature,'Complete the checklist and attach a camera photo.');
    let manifest;try{manifest=manifestSchema.parse(JSON.parse(manifestText));}catch{throw new UserError('The report fields could not be read. Capture the photo again.');}
    requireCondition(canonicalJson(manifest)===manifestText,'The signed report must use canonical fields.');
    requireCondition(manifest.bountyId===id&&manifest.chainId===bounty.chainId&&manifest.scoutWallet===session.wallet,'The report belongs to a different check.',403);
    requireCondition(manifest.captureSource!=='demo-sample'||session.isDemo===true,'Sample illustrations are only allowed for demo checks.',403);
    requireCondition(manifest.photoHash===digest(photo),'The photo changed after signing. Capture and sign it again.');
    const signatureBytes=Buffer.from(signature,'base64');
    requireCondition(signatureBytes.length===64&&nacl.sign.detached.verify(new TextEncoder().encode(manifestText),signatureBytes,new PublicKey(session.wallet).toBytes()),'The report signature could not be verified.',403);
    requireCondition(bounty.checklist.every(check=>!!manifest.answers[check.id])&&Object.keys(manifest.answers).length===bounty.checklist.length,'Answer every checklist question.');
    requireCondition(Math.abs(Date.now()-new Date(manifest.capturedAt).getTime())<=5*60000,'This capture is too old. Take a fresh photo.');
    requireCondition(distanceMeters(manifest.latitude,manifest.longitude,bounty.latitude,bounty.longitude)<=2000,'The attached location is more than 2 km from this check. Move closer and retry.');
    try{const image=sharp(photo,{limitInputPixels:16_000_000});const metadata=await image.metadata();requireCondition(metadata.format==='jpeg','Take a JPEG photo in the app.');await image.raw().toBuffer();}catch{throw new UserError('The photo could not be decoded. Take a JPEG photo and retry.');}
    const hash=digest(manifestText);const reportId=randomUUID();const photoPath=`${id}/${reportId}.jpg`;
    await sql.begin(async tx=>{
      const [challenge]=await tx`select * from sv_challenges where nonce=${manifest.challenge} and kind='capture' and wallet=${session.wallet} and bounty_id=${id} for update`;
      requireCondition(challenge&&!challenge.used_at&&challenge.expires_at>new Date()&&challenge.code===manifest.code,'This capture request has expired or was already used. Take a new photo.');
      const {error}=await storage.storage.from('field-reports').upload(photoPath,photo,{contentType:'image/jpeg',upsert:false});
      if(error)throw new UserError('The photo could not be stored. Please try again.',503);
      await tx`insert into sv_reports(id,bounty_id,scout_wallet,manifest,manifest_hash,photo_path,wallet_signature)
        values(${reportId},${id},${session.wallet},${tx.json(manifest)},${hash},${photoPath},${signature})`;
      await tx`update sv_challenges set used_at=now() where nonce=${manifest.challenge}`;
    });
    const ix=actionInstruction('submit_report',{...bounty,mint:config.mint},bytes(hash));
    return storePrepared(bounty,session,'submit_report',ix,{reportId,manifestHash:hash});
  });

  app.get('/api/reports/:id/photo',async(request,reply)=>{
    const session=await requireSession(request);const id=idSchema.parse(request.params.id);
    const [report]=await sql`select r.photo_path,r.scout_wallet,b.buyer_wallet from sv_reports r join sv_bounties b on b.id=r.bounty_id where r.id=${id} and r.chain_signature is not null`;
    requireCondition(report&&(report.scout_wallet===session.wallet||report.buyer_wallet===session.wallet),'Only the participants can read this photo.',403);
    const {data,error}=await storage.storage.from('field-reports').download(report.photo_path);
    if(error)throw new UserError('The report photo is temporarily unavailable. Please retry.',503);
    return reply.header('Content-Type','image/jpeg').header('Cache-Control','private, no-store').send(Buffer.from(await data.arrayBuffer()));
  });

  app.post('/api/demo/sign',async request=>{
    const session=await requireSession(request);const {preparedId}=z.object({preparedId:idSchema}).parse(request.body);
    const [row]=await sql`select * from sv_prepared where id=${preparedId} and wallet=${session.wallet}`;
    requireCondition(row&&row.expires_at>new Date(),'Prepare this action again before signing.');
    if(row.signature)return {signature:row.signature};
    const pair=await demoSigner(session);const transaction=Transaction.from(Buffer.from(row.data.transaction,'base64'));
    const signature=await sendAndConfirmTransaction(connection,transaction,[pair],{commitment:'confirmed'});
    await sql`update sv_prepared set signature=${signature} where id=${preparedId}`;
    return {signature};
  });

  app.post('/api/bounties/:id/confirm',async request=>{
    const session=await requireSession(request);const id=idSchema.parse(request.params.id);
    const {preparedId,signature}=z.object({preparedId:idSchema,signature:z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/)}).parse(request.body);
    const [prepared]=await sql`select * from sv_prepared where id=${preparedId} and bounty_id=${id} and wallet=${session.wallet}`;
    requireCondition(prepared,'This action was not prepared by your wallet.',403);
    if(prepared.confirmed_at){requireCondition(prepared.signature===signature,'This action has a different confirmed receipt.',409);return loadBounty(id,session);}
    const row=await privateBounty(id);const bounty=row.data;
    const names={create:'Funded',claim:'Claimed',submit_report:'ReportSubmitted',approve:'Paid',refund:'Refunded',dispute:'ReportDisputed'};
    const event=await transactionEvent(signature,names[prepared.action],bounty,session,prepared);
    if(prepared.action==='create')requireCondition(event.buyer.toBase58()===session.wallet&&event.mint.toBase58()===config.mint&&event.amount.toString()===String(Math.round(Number(bounty.reward)*1e6))&&Buffer.from(event.listing_hash).toString('hex')===prepared.data.listingHash,'The funding receipt does not match this bounty.',409);
    if(prepared.action==='claim')requireCondition(event.scout.toBase58()===session.wallet,'The claim belongs to a different scout.',409);
    if(prepared.action==='submit_report')requireCondition(event.scout.toBase58()===session.wallet&&Buffer.from(event.proof_hash).toString('hex')===prepared.data.manifestHash,'The report receipt does not match the stored evidence.',409);
    if(prepared.action==='approve')requireCondition(event.buyer.toBase58()===session.wallet&&event.scout.toBase58()===bounty.scoutWallet&&event.mint.toBase58()===config.mint&&Buffer.from(event.proof_hash).toString('hex')===prepared.data.expectedManifestHash,'The payout receipt does not match the report you approved.',409);
    if(prepared.action==='refund')requireCondition(event.buyer.toBase58()===session.wallet,'The refund belongs to a different buyer.',409);
    if(prepared.action==='dispute')requireCondition(event.buyer.toBase58()===session.wallet&&Buffer.from(event.reason_hash).toString('hex')===prepared.data.reasonHash,'The dispute receipt does not match the request.',409);
    await sql.begin(async tx=>{
      const [current]=await tx`select * from sv_bounties where id=${id} for update`;const updated=current.data;
      if(prepared.action==='create'){updated.status='open';updated.fundingSignature=signature;}
      if(prepared.action==='claim'){updated.status='claimed';updated.scoutWallet=session.wallet;updated.claimSignature=signature;}
      if(prepared.action==='submit_report'){updated.status='submitted';updated.reportSignature=signature;await tx`update sv_reports set chain_signature=${signature} where id=${prepared.data.reportId}`;}
      if(prepared.action==='approve'){updated.status='paid';updated.payoutSignature=signature;}
      if(prepared.action==='refund'){updated.status='cancelled';updated.refundSignature=signature;}
      if(prepared.action==='dispute'){updated.status='disputed';updated.disputeSignature=signature;updated.disputeReason=prepared.data.reason;}
      await tx`update sv_bounties set status=${updated.status},scout_wallet=${updated.scoutWallet??null},data=${tx.json(updated)},last_signature=${signature} where id=${id}`;
      await publishBounty(tx,updated);
      await tx`update sv_prepared set signature=${signature},confirmed_at=now() where id=${preparedId}`;
    });
    return loadBounty(id,session);
  });
}
