import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { configPda, PROGRAM_ID } from '../shared/chain.mjs';
import { checkNetwork, config, connection } from '../server/config.mjs';

const root = resolve(import.meta.dirname, '..');
const deployDirectory = resolve(root, '.local/deploy');
const binary = resolve(deployDirectory, 'scout_vault.so');
const keys = resolve(root, '.local/keys');
const deployerPath = resolve(process.env.DEPLOYER_KEY_PATH);
const programPath = resolve(keys, 'program-keypair.json');
const bufferPath = resolve(keys, 'devnet-buffer-keypair.json');
const cli = process.env.SCOUTVAULT_SOLANA_CLI ?? resolve(root, '.local/agave/solana-release/bin/solana');
const maxProgramLength = 411696;
const loader = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const apply = process.argv.includes('--apply');

assert.equal(config.network, 'devnet');
assert.equal(config.programId, PROGRAM_ID.toBase58());
const genesis = await checkNetwork();
assert.ok(genesis.startsWith('EtWTRAB'), 'Use a Solana devnet RPC.');

const program = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(programPath, 'utf8'))));
assert.ok(program.publicKey.equals(PROGRAM_ID), 'The preserved program key does not match ScoutVault.');
const release = JSON.parse(await readFile(resolve(root, 'reports/release-downloads.json'), 'utf8'));
const publishedProgram = release.assets.find(asset => asset.name === 'scout_vault.so');
const bytes = await readFile(binary);
assert.equal(createHash('sha256').update(bytes).digest('hex'), publishedProgram?.sha256, 'The program does not match the verified release.');
assert.ok((await stat(binary)).size <= maxProgramLength);

const [account, balance, programDataRent, programRent] = await Promise.all([
  connection.getAccountInfo(PROGRAM_ID, 'confirmed'),
  connection.getBalance(config.deployer.publicKey, 'confirmed'),
  connection.getMinimumBalanceForRentExemption(maxProgramLength + 45),
  connection.getMinimumBalanceForRentExemption(36),
]);
if (account) {
  assert.ok(account.executable && account.owner.equals(loader), 'The configured address has a different account.');
  const programData = new PublicKey(account.data.subarray(4, 36));
  const deployed = await connection.getAccountInfo(programData, 'confirmed');
  assert.ok(deployed?.owner.equals(loader) && deployed.data.subarray(45, 45 + bytes.length).equals(bytes), 'Devnet has a different ScoutVault program build.');
}

const minimum = account ? 0 : programDataRent + programRent + 100_000_000;
console.log(JSON.stringify({
  network: 'devnet',
  deployer: config.deployer.publicKey.toBase58(),
  programId: PROGRAM_ID.toBase58(),
  balanceSol: balance / LAMPORTS_PER_SOL,
  requestedSol: minimum / LAMPORTS_PER_SOL,
  programDeployed: Boolean(account),
}, null, 2));
if (!apply) process.exit(0);

if (!account) {
  assert.ok(balance >= minimum, 'Fund the deployer with free devnet SOL before deploying.');
  try {
    await writeFile(bufferPath, JSON.stringify(Array.from(Keypair.generate().secretKey)), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  execFileSync(cli, [
    'program', 'deploy', binary, '--url', config.rpcUrl, '--keypair', deployerPath,
    '--program-id', programPath, '--buffer', bufferPath, '--max-len', String(maxProgramLength),
    '--use-rpc', '--commitment', 'confirmed',
  ], { cwd: root, stdio: 'inherit' });
}

const deployedProgram = await connection.getAccountInfo(PROGRAM_ID, 'confirmed');
assert.ok(deployedProgram?.executable && deployedProgram.owner.equals(loader), 'Devnet has not confirmed the executable program.');
execFileSync(process.execPath, ['--env-file=.local/deployment.env', 'scripts/init-chain.mjs'], { cwd: root, stdio: 'inherit' });
const [settings, mint] = await connection.getMultipleAccountsInfo([configPda(), new PublicKey(config.mint)], 'confirmed');
assert.ok(settings?.owner.equals(PROGRAM_ID) && mint, 'Devnet has not confirmed the escrow configuration and test mint.');
console.log(`Devnet explorer: https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`);
