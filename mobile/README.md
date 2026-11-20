# ScoutVault for Android

The Android app shares ScoutVault's web screens and adds a native camera, foreground location permission, device speech, and Mobile Wallet Adapter signing. A compatible wallet handles the private key and authorization prompts. On Seeker, the Seed Vault Wallet can use the hardware key custody service.

This does not attest a camera sensor, GPS location, or person's identity. The signed report binds the submitted bytes to a wallet and bounty. Buyer review still controls payment.

Install dependencies, run `npx expo prebuild --platform android`, then `npm run android`. Expo Go cannot run the native wallet modules. Use a custom development build or the supplied APK. Configure the website and RPC endpoint in `app.json` before building.

The website publishes Digital Asset Links for the APK's signing certificate. The native bridge accepts wallet and camera requests only from that website origin. External listing and Explorer links open in the system browser.

The wallet integration follows the [Solana Mobile Wallet UI examples](https://docs.solanamobile.com/get-started/react-native/quickstart), which are licensed under Apache 2.0. ScoutVault's application code is MIT licensed.
