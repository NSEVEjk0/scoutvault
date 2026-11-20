import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Keypair,PublicKey,SystemProgram,Transaction,sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint,getMint } from '@solana/spl-token';
import { connection,config,checkNetwork } from '../server/config.mjs';
import { instruction,configPda,accountCoder,PROGRAM_ID } from '../shared/chain.mjs';

const genesis=await checkNetwork();
const program=await connection.getAccountInfo(PROGRAM_ID);
if(!program?.executable)throw new Error('Deploy the compiled escrow program before initializing it.');
const pair=Keypair.fromSecretKey(new Uint8Array(JSON.parse(await readFile(resolve('.local/keys/mint-keypair.json'),'utf8'))));
let mint;
try{mint=await getMint(connection,pair.publicKey);}catch{
  await createMint(connection,config.deployer,config.deployer.publicKey,null,6,pair);
  mint=await getMint(connection,pair.publicKey);
}
if(mint.decimals!==6||mint.mintAuthority?.toBase58()!==config.deployer.publicKey.toBase58())throw new Error('The test mint does not match this deployment.');
const existing=await connection.getAccountInfo(configPda());let signature;
if(!existing){
  const ix=instruction('initialize',{arbiter:new PublicKey(config.arbiter)},{authority:config.deployer.publicKey,config:configPda(),mint:pair.publicKey,system_program:SystemProgram.programId});
  signature=await sendAndConfirmTransaction(connection,new Transaction().add(ix),[config.deployer],{commitment:'confirmed'});
}else{
  const account=accountCoder.decode('Config',existing.data);
  if(account.mint.toBase58()!==config.mint||account.authority.toBase58()!==config.deployer.publicKey.toBase58())throw new Error('Escrow configuration belongs to another deployment.');
}
const status={network:config.network,rpcUrl:config.rpcUrl,genesis,programId:config.programId,mint:config.mint,tokenSymbol:'TEST USDC',configurationSignature:signature,initializedAt:new Date().toISOString()};
await writeFile('.local/chain-status.json',JSON.stringify(status,null,2));console.log(JSON.stringify(status,null,2));
