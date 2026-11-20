import { Keypair } from '@solana/web3.js';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('.local/keys');
await mkdir(directory, { recursive: true, mode: 0o700 });
const keys = {};
for (const name of ['deployer', 'program', 'mint', 'demo-buyer', 'demo-scout']) {
  const path = resolve(directory, `${name}-keypair.json`);
  let pair;
  try { pair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(await readFile(path, 'utf8')))); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    pair = Keypair.generate();
    await writeFile(path, JSON.stringify(Array.from(pair.secretKey)), { mode: 0o600 });
  }
  await chmod(path, 0o600);
  keys[name] = pair.publicKey.toBase58();
}
const rustPath = resolve('contracts/programs/scout_vault/src/lib.rs');
let rust = await readFile(rustPath, 'utf8');
rust = rust.replace(/declare_id!\("[^"]+"\);/, `declare_id!("${keys.program}");`)
  .replace(/const CONFIG_AUTHORITY: Pubkey = pubkey!\("[^"]+"\);/, `const CONFIG_AUTHORITY: Pubkey = pubkey!("${keys.deployer}");`);
await writeFile(rustPath, rust);
await writeFile(resolve('.local/public-addresses.json'), JSON.stringify(keys, null, 2));
console.log(JSON.stringify({ network: 'devnet', addresses: keys }, null, 2));
