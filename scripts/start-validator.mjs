import { spawn } from 'node:child_process';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const addresses=JSON.parse(await readFile('.local/public-addresses.json','utf8'));
await mkdir('.local/validator-ledger',{recursive:true,mode:0o700});
const binary=resolve('.local/agave/solana-release/bin/solana-test-validator');
const args=['--ledger',resolve('.local/validator-ledger'),'--rpc-port','45489','--faucet-port','45493','--bind-address','127.0.0.1','--gossip-port','45491','--dynamic-port-range','45500-45550','--limit-ledger-size','1000000','--mint',addresses.deployer,'--bpf-program',addresses.program,resolve('.local/deploy/scout_vault.so'),'--quiet'];
const process=spawn(binary,args,{stdio:'inherit'});
process.on('exit',code=>{globalThis.process.exitCode=code??1;});
