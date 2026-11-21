# ScoutVault

Check the place before you pay.

A rental page can look convincing while its address, price, or water supply is wrong. ScoutVault lets a requester choose a few things to check, fund a small bounty, and ask someone nearby to visit the place. The scout sends a photo and a signed report. The requester reads it before releasing payment.

The same flow works for a used laptop advertised by a local shop, a campus vendor, or another claim that someone can inspect in person. The request stays small: a clear place, a short checklist, and a defined reward.

## Try it

Open [ScoutVault](https://scoutvault-checks.vercel.app) to explore the interface and read a public listing. Public devnet escrow is waiting for test SOL. The [2:30 captioned walkthrough](https://scoutvault-checks.vercel.app/demo/) shows the complete funded journey recorded during testing on a local Solana validator. That local service has been retired to reduce host resource use. Sample listings and illustrations are labelled. Test tokens have no cash value.

Once devnet settlement is activated, the flow is:

1. Paste a public listing URL. Firecrawl reads it and proposes a short checklist. Edit the questions before funding.
2. Put the pin at the entrance and choose the reward. The Solana program holds the tokens.
3. Switch to the scout, claim the check, and answer each question. Use the camera for a field report, or the labelled sample illustration in the demo.
4. Sign the report. The photo hash, answers, check code, and location metadata are bound to the signing wallet and bounty.
5. Switch to the buyer. ScoutVault checks that the downloaded photo and report match their hashes and wallet signature. Read the report, then approve the payout.

The written checklist is always available. **Play brief** uses browser or device speech when a voice is installed. It is opt-in and needs no provider API key.

The website, captioned walkthrough, and [Android release](https://github.com/NSEVEjk0/scoutvault/releases/tag/v0.1.0) are public. The walkthrough records an actual local-network payout in Solana Explorer. Its former custom RPC is no longer online. Test payments remain disabled in devnet mode until initialization is complete.

## Why the escrow matters

The buyer funds a specific reward before the scout accepts the work. The program checks which wallet can claim, submit, approve, or refund that bounty. Approval includes the exact report hash, so a scout cannot replace a reviewed report while payment is pending. Completed bounty IDs cannot be reused, and payout closes the escrow and token vault.

An unclaimed check can be cancelled. A claimed check without a report can be refunded after expiry. A dispute keeps the reward in escrow until the review wallet recorded in the bounty resolves it. The buyer sees that review rule before funding.

## What a signature proves

A signature binds the report's bytes to a wallet. It does not prove that GPS is genuine, that an image depicts a real visit, that a signer is a verified student, or that a listing is safe. The fresh check code helps the buyer assess the report, but buyer review remains part of the payment rule.

On Android, Mobile Wallet Adapter asks a compatible wallet to authorize signing. Seeker's Seed Vault Wallet can protect its keys through Seed Vault. Seed Vault does not attest camera sensors or GPS. ScoutVault does not claim otherwise.

## What is built

The web app includes the listing reader, editable checklist, nearby map, wallet login, funded requests, scout reports, photo and signature verification, buyer review, refunds, and transaction receipts. The Android client shares those screens and adds the native camera, foreground location permission, device speech, and mobile wallet signing.

Supabase PostgreSQL stores the audit trail, PostGIS searches within two kilometres, Realtime updates the public feed, and private Storage keeps report photos. Public pins are rounded. Exact report coordinates and photos are available to the participants through authenticated routes.

Firecrawl and Supabase are self-hosted on the project's VPS. Public listing URLs go to the listing reader. Wallet keys and private notes are not sent with them. Browser/device voice replaces the originally proposed ElevenLabs integration.

## Run locally

Use Node 24, Docker Compose, and the Solana build tools. The Android build also needs JDK 21 and the Android SDK. Each package has its own lockfile.

```sh
npm ci
npm --prefix server ci
node scripts/create-keys.mjs
node scripts/setup-infra.mjs
docker compose --env-file .local/deployment.env -f infra/compose.yml up -d
docker compose --env-file .local/deployment.env -f infra/firecrawl.yml up -d
```

The setup script creates private credentials under `.local`. It retains them on repeat runs and does not print them. Do not commit that directory or an environment file.

Compile the Anchor program with `cargo-build-sbf --manifest-path contracts/programs/scout_vault/Cargo.toml --sbf-out-dir .local/deploy`, start `node scripts/start-validator.mjs`, then run:

```sh
node scripts/setup-local-test.mjs
node --env-file=.local/local-test.env scripts/init-chain.mjs
cd server
node --env-file=../.local/local-test.env index.mjs
```

In another terminal, run `SCOUTVAULT_API_PROXY=http://127.0.0.1:45580 npm run dev`. The isolated test database and validator keep local transactions out of the public deployment.

## Validation

The contract tests execute the compiled program on a local Solana validator. They check exact balances, unauthorized claim and report attempts, swapped reports, refunds, completed-ID reuse, disputed payouts, and unsolicited token donations. The API exercise follows a complete funded check through private photo storage and payout. Browser checks cover the same journey, phone layouts, keyboard use, and reduced motion.

```sh
npm run test:contract
node --test tests/server/security.test.mjs
node scripts/exercise-flow.mjs
npm run test:e2e
npm run build
```

See [validation](docs/validation.md) and [hosting instructions](docs/infrastructure.md) for the actual results and network used. A build or emulator does not establish a physical Seed Vault test. This is a development-network prototype, not an audited mainnet payment service.

## Project map

* `src/` — responsive web interface and browser wallet/camera integration.
* `mobile/` — Android camera, location, speech, and Mobile Wallet Adapter bridge.
* `server/` — wallet authentication, listing capture, report access, and verified transaction synchronization.
* `contracts/` — Anchor token escrow.
* `shared/` — report format and escrow client IDL.
* `infra/` — Supabase, Firecrawl, and database access policies.
* `docs/` — architecture, privacy, validation, and the short demo storyboard.

The project follows [AGENTS.md](AGENTS.md) and [STYLE_GUIDE.md](STYLE_GUIDE.md) for plain copy, restrained design, accessible motion, and a demo strictly under three minutes.
