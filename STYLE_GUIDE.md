# Writing, interface, motion, and demo

## Writing

Every sentence should be correct, useful, concrete, and clear. Name the person, action, and result. Explain the problem before the stack. Use full sentences in documentation and concise action labels in the app.

Headlines have fewer than ten words and describe a real outcome. A supporting sentence explains how it works. Do not claim instant finality, authenticity of GPS, student identity verification, sponsor eligibility, or production security without evidence.

Avoid: delve, unleash, seamless, revolutionary, empower, tapestry, game-changer, ecosystem synergy, utilize, facilitate, bulletproof, trustless, and guaranteed. No rambling intros, vague comparisons, or claims that this is the only stack that can solve the problem.

## Interface

Use warm off-white, slate text, and one green accent. Typography, whitespace, and alignment do the work. Use subtle borders, a clear hierarchy, and consistent button, input, dialog, and card primitives. Do not use purple gradients, decorative dashboards, or repeated marketing panels.

Keep one primary action per screen. Use 44 px touch targets, visible keyboard focus, real labels, a skip link, descriptive errors, safe-area padding, and captions for meaningful media. Empty and permission-denied states must help someone continue. Reflect navigation and filters in the URL. Require confirmation for spending tokens, approving payout, and refunding escrow.

Explain only the technical detail that affects a user's decision. A wallet signature authenticates the signing wallet. It does not certify a camera, GPS, person, address, or listing. Label test tokens and sample reports clearly. Exact field locations and photos belong to the participants, not the public feed.

## Motion

Animate transform and opacity only. Never animate width, height, top, left, margin, padding, or all properties.

* Button press, hover, and toggle: 120–180 ms.
* Dialog, drawer, toast, and checklist reveal: 200–300 ms.
* Exits: quicker than entrances.
* Maximum UI transition: 400 ms.
* Entrances and state changes: cubic-bezier(0.16, 1, 0.3, 1).
* Exits: cubic-bezier(0.4, 0, 1, 1).
* Spring: stiffness 400, damping 35; clamp overshoot on native. On web use mass 0.7 to avoid overshoot.

Wrap web motion in MotionConfig with reducedMotion="user". Native motion must use the system reduced-motion setting. Do not use permanent pulsing, autoplay decorative loops, bouncing cards, or moving backgrounds. A 150 ms checkmark or sliding tab pill may confirm a state change. Motion must be interruptible.

## Demo

Target 2:30, measure the finished video, and keep it strictly below 3:00. Cap narration at 370 words. The first two sentences explain what ScoutVault does and the concrete problem it addresses.

Use a two-column storyboard: timestamp and visible action on the left, spoken words on the right. At least 90 seconds of a 150-second video show the real app. Follow one request from listing to funded escrow, signed field report, buyer review, and payout. Show the confirmation in Solana Explorer, not code or a terminal.

Use short spoken sentences. No semicolons or nested clauses. Say which network and token are used. Show real clicks and real transaction receipts. Label sample photos and do not call a test wallet a Seed Vault signature. Prefer clear narration and captions to flashy effects. Use brief transform/opacity transitions, readable captions, and no bouncing titles.

## References

* [Paul Graham: How to Write Usefully](https://paulgraham.com/useful.html)
* [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)
* [Y Combinator: How to Pitch Your Startup](https://www.ycombinator.com/library/6q-how-to-pitch-your-startup)
* [Colosseum: Perfecting Your Hackathon Submission](https://blog.colosseum.com/perfecting-your-hackathon-submission/)
* [Dev3pack rules and FAQ](https://hack.dev3pack.xyz/faq)

The user's supplied writing and motion rules take precedence when a reference differs.
