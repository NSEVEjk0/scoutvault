import anchor from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import idl from './scout_vault.json' with { type: 'json' };

const { BorshAccountsCoder, BorshInstructionCoder, BorshCoder, EventParser, BN } = anchor;

export const PROGRAM_ID = new PublicKey(idl.address);
export const instructionCoder = new BorshInstructionCoder(idl);
export const accountCoder = new BorshAccountsCoder(idl);
export const eventParser = new EventParser(PROGRAM_ID, new BorshCoder(idl));
export const configPda = () => PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID)[0];
export const buyerRecordPda = buyer => PublicKey.findProgramAddressSync([Buffer.from('buyer'), new PublicKey(buyer).toBuffer()], PROGRAM_ID)[0];
export function escrowPda(buyer, id) {
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(BigInt(id));
  return PublicKey.findProgramAddressSync([Buffer.from('bounty'), new PublicKey(buyer).toBuffer(), bytes], PROGRAM_ID)[0];
}
export const vaultPda = escrow => PublicKey.findProgramAddressSync([Buffer.from('vault'), new PublicKey(escrow).toBuffer()], PROGRAM_ID)[0];

export function instruction(name, args, accounts) {
  const specification = idl.instructions.find(i=>i.name===name);
  if (!specification) throw new Error(`Unknown escrow action: ${name}`);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: specification.accounts.map(a=>({pubkey:new PublicKey(accounts[a.name]),isSigner:!!a.signer,isWritable:!!a.writable})),
    data: instructionCoder.encode(name,args),
  });
}

export function accountsFor({ buyer, scout, mint, id, arbiter }) {
  const buyerKey = new PublicKey(buyer);
  const mintKey = new PublicKey(mint);
  const escrow = escrowPda(buyer,id);
  return {
    buyer:buyerKey, ...(scout ? {scout:new PublicKey(scout)}:{}), mint:mintKey,
    config:configPda(), buyer_record:buyerRecordPda(buyerKey), escrow, vault:vaultPda(escrow),
    buyer_tokens:getAssociatedTokenAddressSync(mintKey,buyerKey),
    ...(scout ? {scout_tokens:getAssociatedTokenAddressSync(mintKey,new PublicKey(scout))}:{}),
    ...(arbiter ? {arbiter:new PublicKey(arbiter)}:{}),
    token_program:TOKEN_PROGRAM_ID, associated_token_program:ASSOCIATED_TOKEN_PROGRAM_ID,
    system_program:SystemProgram.programId, rent:SYSVAR_RENT_PUBKEY,
  };
}

export function createInstruction({ buyer, mint, id, amount, expiresAt, listingHash }) {
  return instruction('create', {
    bounty_id:new BN(String(id)), amount:new BN(String(amount)), expires_at:new BN(String(expiresAt)),
    listing_hash:Array.from(listingHash),
  },accountsFor({buyer,mint,id}));
}

export function actionInstruction(name, bounty, proofHash) {
  const accounts = accountsFor({buyer:bounty.buyerWallet,scout:bounty.scoutWallet,mint:bounty.mint,id:bounty.chainId,arbiter:bounty.arbiterWallet});
  if (name==='claim') accounts.scout = new PublicKey(bounty.actorWallet);
  const args = name==='submit_report' ? {proof_hash:Array.from(proofHash)}
    : name==='approve' ? {expected_proof_hash:Array.from(proofHash)}
    : name==='dispute' ? {reason_hash:Array.from(proofHash)}
    : name==='resolve' ? {pay_scout:!!bounty.payScout} : {};
  return instruction(name,args,accounts);
}

export async function buildTransaction(connection, payer, ix) {
  const {context,value} = await connection.getLatestBlockhashAndContext('confirmed');
  const transaction = new Transaction({feePayer:new PublicKey(payer),recentBlockhash:value.blockhash}).add(ix);
  return {
    transaction:transaction.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),
    minContextSlot:context.slot, blockhash:value.blockhash,lastValidBlockHeight:value.lastValidBlockHeight,
  };
}

export const decodeEscrow = bytes => accountCoder.decode('Escrow', Buffer.from(bytes));
export const decodeBuyerRecord = bytes => accountCoder.decode('BuyerRecord', Buffer.from(bytes));
export const parseEvents = logs => Array.from(eventParser.parseLogs(logs ?? []));
export const explorerTransaction = signature => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
export const explorerAddress = address => `https://explorer.solana.com/address/${address}?cluster=devnet`;
