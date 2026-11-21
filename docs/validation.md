# Validation record

The final public release checks ran on November 21, 2026 against [scoutvault-checks.vercel.app](https://scoutvault-checks.vercel.app) and the [v0.1.0 release](https://github.com/NSEVEjk0/scoutvault/releases/tag/v0.1.0). The production deployment is ready. The recorded payout demonstration uses the explicitly labelled local Solana network. After testing and recording were complete, the local validator and its ledger were removed at the user's request to free host resources. Public devnet activation remains pending.

The compiled Anchor program passed [seven local-validator scenarios](../reports/contract.txt): exact funding and payout, buyer self-claim rejection, exclusive scout assignment, report and payment authorization, changed-report rejection, refund and ID-reuse protection, dispute authority, and unsolicited vault donations. Several checks run within the same scenario.

Three server checks passed for private and credential-bearing URL rejection, captured-source receipt tampering, and canonical report encoding. The [complete API exercise](../reports/api-flow.json) funded a two-token bounty, claimed it, signed and stored a sample report, blocked anonymous photo access, preserved the original photo hash, approved the exact report, and verified a two-token increase in the scout's balance.

Three additional configuration checks passed after retirement. They verify that retired local requests return HTTP 410 without contacting the stopped gateway or falling back to devnet, that devnet configuration still loads, and that an older cached registry cannot replace a newer bundled gateway.

All three hosted browser checks passed against the public local demo before its retirement. They covered desktop and phone layouts, contrast, keyboard focus, reduced motion, and a complete buyer-to-scout payout. The [buyer/scout regression check](../reports/browser.json) also passed after the API bootstrap fix, including a full page reload and re-verification of the private report. The web production build, TypeScript checks, and GitHub's build and server checks passed for the published application source.

The [public hosting check](../reports/hosted.json) verifies devnet configuration and API health, the sample listing, privacy page, demo page, Android identity route, and the retired local route. [Release download checks](../reports/release-downloads.json) fetched the published APK, MP4, and compiled program and confirmed that each SHA-256 hash matches its verified build artifact. The hosted captions and poster also match the final local files.

The [finished captioned MP4](../reports/demo.json) is exactly 150 seconds, with a 276-word script and a real local-validator payout shown in Explorer. [Browser playback checks](../reports/media-browser.json) confirmed the public video loads and plays on desktop and phone, reports a 150-second duration, and fits both layouts without horizontal overflow. The recording has captions and no audio track; the narration script is available for the founder to record in their own voice.

The [Android release verification](../reports/android.json) checked APK signing, package identity, permissions, and its certificate against the published website identity. It compiles against the stable API 37.0 SDK and targets API 36 on arm64 devices. It is a signed development release with optional minification disabled. A physical Seeker test has not been performed.

The intended public devnet program is not yet deployed; its wallet still had zero free test SOL at the final check. The recorded local demo executed the actual compiled program on its own validator and database. The video captures a readable receipt from that run. The retired local RPC and its old receipts are no longer available online. Local transactions are never presented as public devnet transactions.

Local transactions are not public devnet transactions. A sample illustration is not a site visit. A wallet signature binds bytes to a wallet, not to an authentic camera sensor, GPS reading, student identity, or safe listing. Compilation and passing checks do not establish a security audit.
