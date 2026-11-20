import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const addresses = JSON.parse(await readFile('.local/public-addresses.json', 'utf8'));
const disc = (namespace, name) => Array.from(createHash('sha256').update(`${namespace}:${name}`).digest().subarray(0, 8));
const field = (name, type) => ({ name, type });
const key = (name, writable = false, signer = false) => ({ name, ...(writable ? { writable } : {}), ...(signer ? { signer } : {}) });
const struct = (name, fields) => ({ name, type: { kind: 'struct', fields: fields.map(([n, t]) => field(n, t)) } });
const hash = { array: ['u8', 32] };
const pubkey = 'pubkey';
const types = [
  struct('Config', [['authority',pubkey],['mint',pubkey],['arbiter',pubkey],['bump','u8']]),
  struct('BuyerRecord', [['buyer',pubkey],['last_id','u64'],['bump','u8']]),
  struct('Escrow', [
    ['version','u8'],['bump','u8'],['vault_bump','u8'],['status','u8'],['buyer',pubkey],['scout',pubkey],
    ['mint',pubkey],['arbiter',pubkey],['bounty_id','u64'],['amount','u64'],['expires_at','i64'],
    ['claimed_at','i64'],['submitted_at','i64'],['listing_hash',hash],['proof_hash',hash],['dispute_hash',hash],
  ]),
];
const events = [
  struct('Configured', [['mint',pubkey],['arbiter',pubkey]]),
  struct('Funded', [['bounty_id','u64'],['escrow',pubkey],['buyer',pubkey],['mint',pubkey],['amount','u64'],['expires_at','i64'],['listing_hash',hash]]),
  struct('Claimed', [['bounty_id','u64'],['escrow',pubkey],['scout',pubkey]]),
  struct('ReportSubmitted', [['bounty_id','u64'],['escrow',pubkey],['scout',pubkey],['proof_hash',hash],['submitted_at','i64']]),
  struct('Paid', [['bounty_id','u64'],['escrow',pubkey],['buyer',pubkey],['scout',pubkey],['mint',pubkey],['pledged_amount','u64'],['transferred_amount','u64'],['proof_hash',hash]]),
  struct('Refunded', [['bounty_id','u64'],['escrow',pubkey],['buyer',pubkey],['amount','u64']]),
  struct('ReportDisputed', [['bounty_id','u64'],['escrow',pubkey],['buyer',pubkey],['reason_hash',hash],['arbiter',pubkey]]),
  struct('DisputeResolved', [['bounty_id','u64'],['escrow',pubkey],['arbiter',pubkey],['buyer',pubkey],['scout',pubkey],['amount','u64'],['pay_scout','bool']]),
];
const instructions = [
  { name:'initialize', accounts:[key('authority',true,true),key('config',true),key('mint'),key('system_program')], args:[field('arbiter',pubkey)] },
  { name:'create', accounts:[key('buyer',true,true),key('config'),key('buyer_record',true),key('mint'),key('escrow',true),key('vault',true),key('buyer_tokens',true),key('token_program'),key('system_program'),key('rent')], args:[field('bounty_id','u64'),field('amount','u64'),field('expires_at','i64'),field('listing_hash',hash)] },
  { name:'claim', accounts:[key('scout',false,true),key('escrow',true)], args:[] },
  { name:'submit_report', accounts:[key('scout',false,true),key('escrow',true)], args:[field('proof_hash',hash)] },
  { name:'approve', accounts:[key('buyer',true,true),key('escrow',true),key('scout'),key('mint'),key('vault',true),key('scout_tokens',true),key('token_program'),key('associated_token_program'),key('system_program')], args:[field('expected_proof_hash',hash)] },
  { name:'refund', accounts:[key('buyer',true,true),key('escrow',true),key('mint'),key('vault',true),key('buyer_tokens',true),key('token_program')], args:[] },
  { name:'dispute', accounts:[key('buyer',false,true),key('escrow',true)], args:[field('reason_hash',hash)] },
  { name:'resolve', accounts:[key('arbiter',true,true),key('buyer',true),key('scout'),key('escrow',true),key('mint'),key('vault',true),key('buyer_tokens',true),key('scout_tokens',true),key('token_program'),key('associated_token_program'),key('system_program')], args:[field('pay_scout','bool')] },
].map(i => ({ ...i, discriminator: disc('global',i.name) }));
const idl = {
  address: addresses.program,
  metadata: { name:'scout_vault', version:'0.1.0', spec:'0.1.0', description:'Reviewed field-report token escrow' },
  instructions,
  accounts: types.map(t=>({name:t.name,discriminator:disc('account',t.name)})),
  events: events.map(t=>({name:t.name,discriminator:disc('event',t.name)})),
  types:[...types,...events],
};
await mkdir('shared', { recursive:true });
await writeFile('shared/scout_vault.json',JSON.stringify(idl,null,2)+'\n');
console.log(`Wrote the escrow client IDL for ${idl.address}`);
