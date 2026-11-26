# Validation record

On November 26, 2026, the verified compiled Anchor program was deployed to public Solana devnet. The hosted buyer and scout workflow funded a sample listing, claimed it, signed and stored its report, verified the photo and wallet signature, and paid two test tokens. The payout finalized, and the scout’s on-chain balance increased from 10 to 12 TEST USDC. [Payout evidence](../reports/devnet-payout.json) · [Solana Explorer](https://explorer.solana.com/tx/3zSVqcCExnJiLqKwrtcEPzsxdhnuWQi3LKJLvwjnDB3PHXycJvsbXvBdo2qfsFBpwX2txAyxFN1RqRBA7iyw7ZXm?cluster=devnet).

The current video shows that devnet run with English narration and captions. The labelled illustration and software wallets provide a reproducible demo. [Public walkthrough](https://scoutvault-checks.vercel.app/demo/) · [Video verification](../reports/demo-devnet.json).

The hosted retest passed all three browser cases after a mobile navigation contrast fix. The checks covered desktop and phone layouts, keyboard focus, reduced motion, and a new funded request through buyer approval and page reload. The signed report remained verifiable after refresh. Public Solana RPC confirmed finality for funding, claim, report, and approval. The scout's balance rose from 10 to 12 TEST USDC. The public bounty view omitted the exact entrance address and private report. [Retest results](../reports/devnet-browser-retest.json) · [New payout in Solana Explorer](https://explorer.solana.com/tx/RiBo6N74ojadMqeTAEpUchesqeKLmJKTuSNudPhKWBNb2ZeDExSWpRhskpDYbvQYBfh6VQRsPBvZ7WyfazD9PcY?cluster=devnet)

The production build and all six server tests passed. `npm test` runs the server suite. The narrated walkthrough played with English captions on desktop and phone after the update. The published APK hash and website certificate fingerprint matched the verified release. [Hosting check](../reports/hosted.json) · [Playback check](../reports/media-devnet.json) · [Android verification](../reports/android.json)

The original public release checks ran November 21. The separate local validator and its ledger retired after the local recording was complete. The November 21 reports below describe that earlier setup.

The compiled Anchor program passed [seven local-validator scenarios](../reports/contract.txt): exact funding and payout, buyer self-claim rejection, exclusive scout assignment, report and payment authorization, changed-report rejection, refund and ID-reuse protection, dispute authority, and unsolicited vault donations. Several checks run within the same scenario.

Three server checks passed for private and credential-bearing URL rejection, captured-source receipt tampering, and canonical report encoding. The [complete API exercise](../reports/api-flow.json) funded a two-token bounty, claimed it, signed and stored a sample report, blocked anonymous photo access, preserved the original photo hash, approved the exact report, and verified a two-token increase in the scout's balance.

Three additional configuration checks passed after retirement. They verify that retired local requests return HTTP 410 without contacting the stopped gateway or falling back to devnet, that devnet configuration still loads, and that an older cached registry cannot replace a newer bundled gateway.

All three hosted browser checks passed against the public local demo before its retirement. They covered desktop and phone layouts, contrast, keyboard focus, reduced motion, and a complete buyer-to-scout payout. The [buyer/scout regression check](../reports/browser.json) also passed after the API bootstrap fix, including a full page reload and re-verification of the private report. The web production build, TypeScript checks, and GitHub's build and server checks passed for the published application source.

The [public hosting check](../reports/hosted.json) verifies devnet configuration and API health, the sample listing, privacy page, demo page, Android identity route, and the retired local route. [Release download checks](../reports/release-downloads.json) fetched the published APK, MP4, and compiled program and confirmed that each SHA-256 hash matches its verified build artifact. The hosted captions and poster also match the final local files.

The [finished captioned MP4](../reports/demo.json) is exactly 150 seconds, with a 276-word script and a real local-validator payout shown in Explorer. [Browser playback checks](../reports/media-browser.json) confirmed the public video loads and plays on desktop and phone, reports a 150-second duration, and fits both layouts without horizontal overflow. The recording has captions and no audio track; the narration script is available for the founder to record in their own voice.

The [Android release verification](../reports/android.json) checked APK signing, package identity, permissions, and its certificate against the published website identity. It compiles against the stable API 37.0 SDK and targets API 36 on arm64 devices. It is a signed development release with optional minification disabled. A physical Seeker test has not been performed.

The report signature binds the submitted bytes to the wallet and bounty. The buyer reviews the evidence before approving payment. The hardware check and independent security audit remain open.
