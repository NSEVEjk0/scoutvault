import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.mjs';

export const sql=postgres(config.databaseUrl,{max:8,idle_timeout:20,connect_timeout:15,prepare:true});
export const storage=createClient(`http://127.0.0.1:${config.port}/supabase`,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

export async function createPhotoBucket(){
  const {data}=await storage.storage.getBucket('field-reports');
  if(!data){
    const {error}=await storage.storage.createBucket('field-reports',{public:false,fileSizeLimit:5*1024*1024,allowedMimeTypes:['image/jpeg']});
    if(error&&!error.message.includes('already exists'))throw error;
  }
}

export async function photoUrl(path){
  const {data,error}=await storage.storage.from('field-reports').createSignedUrl(path,300);
  if(error)throw error;
  return data.signedUrl.replace(`http://127.0.0.1:${config.port}`,config.apiOrigin);
}

export function publicBounty(data){
  const fields=['id','chainId','title','category','area','latitude','longitude','reward','tokenSymbol','status','buyerWallet','scoutWallet','createdAt','expiresAt','checklist','escrowAddress','fundingSignature','claimSignature','reportSignature','payoutSignature','isDemo'];
  const value=Object.fromEntries(fields.filter(key=>data[key]!==undefined).map(key=>[key,data[key]]));
  value.description='Ask a scout to check the listing and send a signed report.';
  const latitude=Math.round(value.latitude*1000)/1000;
  const longitude=Math.round(value.longitude*1000)/1000;
  value.checklist=value.checklist.map(check=>({...check,sourceClaim:'Claim selected from the listing.'}));
  const baseline={...data.baseline,address:'',description:'',price:'',checklist:value.checklist};
  return {...value,latitude,longitude,baseline};
}

export async function publishBounty(tx,data){
  const safe=publicBounty(data);
  await tx`insert into public_bounties(id,status,latitude,longitude,data) values(${data.id},${data.status},${safe.latitude},${safe.longitude},${tx.json(safe)})
    on conflict(id) do update set status=excluded.status,latitude=excluded.latitude,longitude=excluded.longitude,data=excluded.data`;
}

export async function loadBounty(id,session){
  const rows=await sql`select data from sv_bounties where id=${id} and status<>'draft'`;
  if(!rows.length)return null;
  const bounty=rows[0].data;
  if(!session?.wallet||(session.wallet!==bounty.buyerWallet&&session.wallet!==bounty.scoutWallet))return publicBounty(bounty);
  const reports=await sql`select * from sv_reports where bounty_id=${id} and chain_signature is not null order by created_at desc limit 1`;
  if(reports.length){
    const report=reports[0];const manifest=report.manifest;
    bounty.report={id:report.id,bountyId:id,scoutWallet:report.scout_wallet,submittedAt:report.created_at.toISOString(),
      latitude:manifest.latitude,longitude:manifest.longitude,accuracyMeters:manifest.accuracyMeters,captureSource:manifest.captureSource,
      answers:manifest.answers,note:manifest.note,photoHash:manifest.photoHash,manifestHash:report.manifest_hash,
      photoUrl:`${config.apiOrigin}/api/reports/${report.id}/photo`,walletSignature:report.wallet_signature,chainSignature:report.chain_signature,
      manifest,challenge:manifest.challenge,freshnessLabel:manifest.captureSource==='demo-sample'?'Demo sample':'Challenge-bound report'};
  }
  return bounty;
}
