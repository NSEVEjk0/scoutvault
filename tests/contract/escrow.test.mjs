import { before,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Connection,Keypair,PublicKey,Transaction,SystemProgram,sendAndConfirmTransaction } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount,mintTo,getAccount,createTransferInstruction } from '@solana/spl-token';
import { actionInstruction,createInstruction,accountsFor,decodeEscrow,parseEvents,PROGRAM_ID } from '../../shared/chain.mjs';

const connection=new Connection('http://127.0.0.1:45489','confirmed');
const addresses=JSON.parse(await readFile('.local/public-addresses.json','utf8'));
const admin=Keypair.fromSecretKey(new Uint8Array(JSON.parse(await readFile('.local/keys/deployer-keypair.json','utf8'))));
const mint=new PublicKey(addresses.mint);
const hash=value=>createHash('sha256').update(value).digest();
let sequence=0n;
before(async()=>{const genesis=await connection.getGenesisHash();assert.ok(!genesis.startsWith('EtWTRAB')&&!genesis.startsWith('5eykt'),'Contract tests must run on the private local validator.');assert.ok((await connection.getAccountInfo(PROGRAM_ID))?.executable);});

async function send(ix,signer){return sendAndConfirmTransaction(connection,new Transaction().add(ix),[signer],{commitment:'confirmed'});}
async function participants(){
  const buyer=Keypair.generate(),scout=Keypair.generate(),stranger=Keypair.generate();
  await sendAndConfirmTransaction(connection,new Transaction().add(...[buyer,scout,stranger].map(key=>SystemProgram.transfer({fromPubkey:admin.publicKey,toPubkey:key.publicKey,lamports:1e9}))),[admin],{commitment:'confirmed'});
  const buyerTokens=await getOrCreateAssociatedTokenAccount(connection,admin,mint,buyer.publicKey);
  const scoutTokens=await getOrCreateAssociatedTokenAccount(connection,admin,mint,scout.publicKey);
  await mintTo(connection,admin,mint,buyerTokens.address,admin,10_000_000);
  return {buyer,scout,stranger,buyerTokens:buyerTokens.address,scoutTokens:scoutTokens.address};
}
async function funded(expirySeconds=3600){
  const people=await participants();const id=(BigInt(Date.now())*1000n+ ++sequence).toString();
  const bounty={chainId:id,buyerWallet:people.buyer.publicKey.toBase58(),scoutWallet:people.scout.publicKey.toBase58(),mint:mint.toBase58(),arbiterWallet:admin.publicKey.toBase58()};
  const accounts=accountsFor({buyer:people.buyer.publicKey,scout:people.scout.publicKey,mint,id,arbiter:admin.publicKey});
  const signature=await send(createInstruction({buyer:people.buyer.publicKey,mint,id,amount:2_000_000,expiresAt:Math.floor(Date.now()/1000)+expirySeconds,listingHash:hash(id)}),people.buyer);
  return {...people,bounty,accounts,signature,id};
}
async function escrow(fixture){const data=await connection.getAccountInfo(fixture.accounts.escrow);return data?decodeEscrow(data.data):null;}
async function tokenBalance(address){return (await getAccount(connection,address)).amount;}
async function claimed(fixture){await send(actionInstruction('claim',{...fixture.bounty,actorWallet:fixture.scout.publicKey}),fixture.scout);}
async function report(fixture,value='report'){const proof=hash(value);await send(actionInstruction('submit_report',fixture.bounty,proof),fixture.scout);return proof;}

test('funding locks the exact reward and approval pays the assigned scout once',async()=>{
  const f=await funded();assert.equal(await tokenBalance(f.buyerTokens),8_000_000n);assert.equal(await tokenBalance(f.accounts.vault),2_000_000n);
  assert.equal((await escrow(f)).status,0);await claimed(f);const proof=await report(f);
  const signature=await send(actionInstruction('approve',f.bounty,proof),f.buyer);
  assert.equal(await tokenBalance(f.scoutTokens),2_000_000n);assert.equal(await escrow(f),null);assert.equal(await connection.getAccountInfo(f.accounts.vault),null);
  const transaction=await connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
  const event=parseEvents(transaction.meta.logMessages).find(event=>event.name==='Paid');assert.equal(event.data.pledged_amount.toString(),'2000000');assert.equal(event.data.scout.toBase58(),f.scout.publicKey.toBase58());
  await assert.rejects(send(actionInstruction('approve',f.bounty,proof),f.buyer));assert.equal(await tokenBalance(f.scoutTokens),2_000_000n);
});
test('a buyer cannot claim their own check and a second scout cannot take a claimed check',async()=>{
  const f=await funded();await assert.rejects(send(actionInstruction('claim',{...f.bounty,actorWallet:f.buyer.publicKey}),f.buyer));
  await claimed(f);await assert.rejects(send(actionInstruction('claim',{...f.bounty,actorWallet:f.stranger.publicKey}),f.stranger));assert.equal((await escrow(f)).scout.toBase58(),f.scout.publicKey.toBase58());
});
test('only the assigned scout can submit and only the buyer can approve',async()=>{
  const f=await funded();await claimed(f);
  const bad={...f.bounty,scoutWallet:f.stranger.publicKey.toBase58()};await assert.rejects(send(actionInstruction('submit_report',bad,hash('bad')),f.stranger));
  const proof=await report(f);await assert.rejects(send(actionInstruction('approve',{...f.bounty,buyerWallet:f.stranger.publicKey.toBase58()},proof),f.stranger));assert.equal(await tokenBalance(f.accounts.vault),2_000_000n);
});
test('payout is rejected when the scout changes the report after buyer review',async()=>{
  const f=await funded();await claimed(f);const first=await report(f,'first photo');const second=await report(f,'changed photo');
  await assert.rejects(send(actionInstruction('approve',f.bounty,first),f.buyer));assert.equal(await tokenBalance(f.accounts.vault),2_000_000n);
  await send(actionInstruction('approve',f.bounty,second),f.buyer);assert.equal(await tokenBalance(f.scoutTokens),2_000_000n);
});
test('an open check refunds to its buyer and its completed id cannot be reused',async()=>{
  const f=await funded();await send(actionInstruction('refund',f.bounty),f.buyer);assert.equal(await tokenBalance(f.buyerTokens),10_000_000n);
  await assert.rejects(send(createInstruction({buyer:f.buyer.publicKey,mint,id:f.id,amount:2_000_000,expiresAt:Math.floor(Date.now()/1000)+3600,listingHash:hash(f.id)}),f.buyer));assert.equal(await tokenBalance(f.buyerTokens),10_000_000n);
});
test('a submitted report cannot be refunded and only the recorded arbiter resolves disputes',async()=>{
  const f=await funded();await claimed(f);await report(f);await assert.rejects(send(actionInstruction('refund',f.bounty),f.buyer));
  await send(actionInstruction('dispute',f.bounty,hash('needs review')),f.buyer);
  await assert.rejects(send(actionInstruction('resolve',{...f.bounty,arbiterWallet:f.stranger.publicKey.toBase58(),payScout:true}),f.stranger));
  await send(actionInstruction('resolve',{...f.bounty,payScout:true}),admin);assert.equal(await tokenBalance(f.scoutTokens),2_000_000n);
});
test('unsolicited vault donations do not block payout or keep rent locked',async()=>{
  const f=await funded();await send(createTransferInstruction(f.buyerTokens,f.accounts.vault,f.buyer.publicKey,1),f.buyer);await claimed(f);const proof=await report(f);
  await send(actionInstruction('approve',f.bounty,proof),f.buyer);assert.equal(await tokenBalance(f.scoutTokens),2_000_001n);assert.equal(await escrow(f),null);
});
