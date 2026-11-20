# What is shared

The public feed contains the title, checklist, reward, status, wallet addresses, transaction receipts, and a rounded map pin. Put private directions in the entrance-address field, not the public title or checklist.

Precise report coordinates, photos, and observations are stored in the project's private database and storage. The buyer and assigned scout can read them. Photo requests require a valid wallet session and participant check. The interface verifies the original photo bytes against their signed hash. Camera files can contain device metadata, which stays with the private photo rather than the public feed.

Firecrawl receives the public URL being read. Do not paste a login link or a URL containing someone else's private access token. Local network and metadata-service destinations are blocked. Listing text is treated as data, not as instructions to the server or coding agent.

The map loads OpenStreetMap tiles. That provider receives normal map tile requests, which indicate the approximate map area being viewed. Exact field-report coordinates are not put in the public map rows or on chain.

Speech is opt-in. The browser or Android speech engine processes the selected checklist text. Some voices are local and others need a network connection. ScoutVault does not promise offline audio on every device and does not send audio to ElevenLabs.

A connected wallet keeps its private key in the wallet application. Demo keys belong only to test wallets and are encrypted on the server. They must never hold real funds. Credentials and backups are excluded from the public repository.

A photo, location value, or wallet signature is not proof of a person's identity, an authentic GPS sensor reading, or a safe rental. Inspect the report and make your own decision before releasing the bounty or paying a seller.
