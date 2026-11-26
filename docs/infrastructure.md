# Hosting and development networks

The website is hosted at [scoutvault-checks.vercel.app](https://scoutvault-checks.vercel.app). Vercel serves the interface and a configuration bootstrap. The devnet API, Supabase services, and Firecrawl run on the project's VPS. API listeners bind to loopback. Cloudflare provides HTTPS endpoints, and `gateway.json` records their current addresses. The configuration bootstrap reads that public registry so a restarted tunnel does not require rebuilding the website.

The public devnet deployment uses `postgres`. Automated local checks used the separate `scoutvault_test` database, and the original local demonstration used `scoutvault_demo`. The local validator, ledger, API, and gateway retired on November 21, 2026. Old `?demo=local` website links open the current recorded demo. The local configuration endpoint returns HTTP 410.

The current video shows a finalized payout in Solana Explorer with devnet selected. The devnet database uses Supabase Realtime for the public feed. Report photos stay in private Supabase Storage and require participant authorization through the API.

The source and published APK, video, compiled program, and signing keys were retained. Unused local build caches and downloaded SDK archives were removed. Rebuilding Android requires installing its SDK, JDK, and dependencies again. Local validator SOL stays on that local network; it does not fund the public devnet deployment.

## Firecrawl attribution

Firecrawl runs as a separate, unmodified service under its [AGPL-3.0 license](https://github.com/firecrawl/firecrawl/blob/f96a5154660165061d5b1defa0091bee28571f5d/LICENSE). Its pinned image corresponds to [source revision f96a515](https://github.com/firecrawl/firecrawl/tree/f96a5154660165061d5b1defa0091bee28571f5d). ScoutVault calls its HTTP scraping API. The Docker Compose configuration adjusts startup commands, networks, resource limits, and the public-web proxy. It does not alter Firecrawl's application source. The [complete upstream source](https://github.com/firecrawl/firecrawl/tree/f96a5154660165061d5b1defa0091bee28571f5d) is available to people using the hosted listing reader.

The Supabase and Firecrawl containers use separate private database credentials. Generated credentials, signing keys, ledgers, and backups stay under `.local/` and are excluded from Git.

## Activate devnet

The deployment wallet is `9YaY8NLqutg5FkBKCypWGQ3wFUhpE4F3jPqLUwBwfPxo`. It received 20 test SOL on November 26. The program and project test mint are active. [Official faucet](https://faucet.solana.com) · [GitHub sign-in faucet](https://www.devnetfaucet.org/) · [Deployment transaction](https://explorer.solana.com/tx/3mvSS3BWPFjitcAWXjbJeL1Qz2WMXRwk2asta9xB55BnsApeSUava5Xd7sLojLSG5QUA7zhaTUwyCE4XHqUQNDpT?cluster=devnet).

Budget **3 devnet SOL** to cover roughly 2.1 SOL for program rent plus deployment fees, escrow and mint setup, and a few demo wallets. The deployment command checks the cluster, program key, binary hash, and available balance. It keeps a private buffer key so the upload can resume.

```sh
node --env-file=.local/deployment.env scripts/deploy-devnet.mjs
node --env-file=.local/deployment.env scripts/deploy-devnet.mjs --apply
npm run test:live
```

The first command checks readiness. `--apply` deploys the verified binary and initializes the mint and escrow. The API enables test payments once those accounts exist. Run a complete buyer and scout flow and confirm the payout in Solana Explorer.

## Android release

Use Node 24, JDK 21, and the Android SDK. The Android build compiles with the stable Android API 37.0 SDK and targets API 36 on arm64 devices. After installing `mobile/` dependencies and generating Android sources with Expo, run:

```sh
node scripts/prepare-android.mjs
python3 scripts/build-android.py
```

The signing script creates a private release certificate and publishes only its SHA-256 fingerprint in Digital Asset Links. The build reads passwords from a private environment file. Verify the finished APK with Android's `apksigner` and compare its certificate to `public/.well-known/assetlinks.json` before publishing. APKs and the demo video are release assets rather than files in Git.

Systemd service templates are provided in `infra/`. Their paths assume `/root/scoutvault`; adjust them for another host. The gateway services update the registry after an endpoint changes. Continued availability depends on the VPS and its tunnel services. This prototype has not received a security audit or a physical Seeker test.
