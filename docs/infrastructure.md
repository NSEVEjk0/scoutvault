# Hosting and development networks

The website is hosted at [scoutvault-checks.vercel.app](https://scoutvault-checks.vercel.app). Vercel serves the interface and a configuration bootstrap. The API, Supabase services, Firecrawl, and local demonstration validator run on the project's VPS. API listeners bind to loopback. Cloudflare provides HTTPS endpoints, and `gateway.json` records their current addresses. The configuration bootstrap reads that public registry so a restarted tunnel does not require rebuilding the website.

There are three separate databases. The intended devnet deployment uses `postgres`. Automated local checks use `scoutvault_test`. The public **Local Solana demo** uses `scoutvault_demo`. Local-demo requests must include `?demo=local` when opening the app. The interface retains that mode during navigation, labels it throughout, and keeps its demo sessions separate from devnet sessions. It uses the compiled Anchor program on a local validator. It is not public Solana devnet. Compatible phone and browser wallets are offered in devnet mode.

Local receipts open Solana Explorer with the custom HTTPS RPC selected. Devnet receipts select devnet. The local demo refreshes through the API. The devnet database has Supabase Realtime configured for its public feed. Report photos remain in private Supabase Storage and require participant authorization through the API.

Explorer asks for confirmation before reading an unfamiliar custom RPC. Select **Connect** only when its displayed server matches the demo gateway in `gateway.json`. The local ledger retains a bounded history, so older local receipts can be pruned. The video records a fresh, readable receipt. Increasing retention does not restore receipts that were already pruned.

## Firecrawl attribution

Firecrawl runs as a separate, unmodified service under its [AGPL-3.0 license](https://github.com/firecrawl/firecrawl/blob/f96a5154660165061d5b1defa0091bee28571f5d/LICENSE). Its pinned image corresponds to [source revision f96a515](https://github.com/firecrawl/firecrawl/tree/f96a5154660165061d5b1defa0091bee28571f5d). ScoutVault calls its HTTP scraping API. The Docker Compose configuration adjusts startup commands, networks, resource limits, and the public-web proxy. It does not alter Firecrawl's application source. The [complete upstream source](https://github.com/firecrawl/firecrawl/tree/f96a5154660165061d5b1defa0091bee28571f5d) is available to people using the hosted listing reader.

The Supabase and Firecrawl containers use separate private database credentials. Generated credentials, signing keys, ledgers, and backups stay under `.local/` and are excluded from Git.

## Activate devnet

Only free devnet SOL is used. The deployment wallet is `9YaY8NLqutg5FkBKCypWGQ3wFUhpE4F3jPqLUwBwfPxo`. The [official faucet](https://faucet.solana.com/?walletAddress=9YaY8NLqutg5FkBKCypWGQ3wFUhpE4F3jPqLUwBwfPxo&amount=5&cluster=devnet) requires a browser CAPTCHA. The compiled program needs approximately 2.1 test SOL for rent with upgrade headroom, plus initialization and demo funding.

After funding, deploy `.local/deploy/scout_vault.so` with the matching private program keypair, the deployer keypair, an explicit devnet RPC, and a maximum program length of 411696 bytes. Then run:

```sh
node --env-file=.local/deployment.env scripts/init-chain.mjs
npm run test:live
```

The API enables test payments only after the configured executable program, escrow configuration, and mint exist. Verify a complete funding, report, approval, and payout journey on devnet before describing public devnet settlement as working.

## Android release

Use Node 24, JDK 21, and the Android SDK. The Android build compiles with the stable Android API 37.0 SDK and targets API 36 on arm64 devices. After installing `mobile/` dependencies and generating Android sources with Expo, run:

```sh
node scripts/prepare-android.mjs
python3 scripts/build-android.py
```

The signing script creates a private release certificate and publishes only its SHA-256 fingerprint in Digital Asset Links. The build reads passwords from a private environment file. Verify the finished APK with Android's `apksigner` and compare its certificate to `public/.well-known/assetlinks.json` before publishing. APKs and the demo video are release assets rather than files in Git.

Systemd service templates are provided in `infra/`. Their paths assume `/root/scoutvault`; adjust them for another host. The gateway services update the registry after an endpoint changes. Continued availability depends on the VPS and its tunnel services. This prototype has not received a security audit or a physical Seeker test.
