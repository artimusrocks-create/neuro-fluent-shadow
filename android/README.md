# Neuro-Fluent Shadow — Android app

This folder is the Android app: a **Trusted Web Activity** (TWA). It opens the website full-screen in Chrome,
so every website update reaches the app instantly — you only rebuild the app to change its name, icon or version.

- Package: `com.neurofluent.shadow`
- Opens: `https://neuro-fluent-shadow-faj3.vercel.app/?app=android` (the `?app=android` hides prices and payment links, which Google Play requires)
- Generated with Bubblewrap (`twa-manifest.json` is the source of truth)

## The signing key (important)

The app is signed with `shadow-release.keystore` (alias `shadow`). It is **not** in this repo.
Keep it, plus its password, somewhere safe (a backup on Google Drive is fine).
If you lose it, you can't update the downloadable APK — people would have to uninstall and reinstall.

The key's SHA-256 is baked into `lib/android.ts`, so `/.well-known/assetlinks.json` vouches for the app.

## Rebuild (new version, new address, new icon)

1. Edit `twa-manifest.json`: raise `appVersionCode` by 1 and set `appVersion` (e.g. `1.0.1`).
   Changed the site address? Update `host`, `iconUrl`, `maskableIconUrl`, `webManifestUrl`, `fullScopeUrl`.
2. Put `shadow-release.keystore` in this folder.
3. Run (needs Node 20+, it installs Java and the Android SDK the first time):

   ```bash
   npx @bubblewrap/cli update      # regenerates the project from twa-manifest.json
   npx @bubblewrap/cli build       # asks for the keystore password, outputs app-release-signed.apk and app-release-bundle.aab
   ```

   Or ask Claude to do it — that's how this version was built.

## Google Play

Upload the `.aab` file. After the first upload, Play Console → **Test and release → App integrity** shows the
**App signing key certificate SHA-256**. Add it to Vercel as `ANDROID_SHA256` (comma-separated if several) and
redeploy, otherwise the Play version shows a browser address bar.

Georgia can't have a Google Play merchant account, so the Play version is free: no prices or "buy" buttons inside it.
People subscribe on the website or in Telegram, then log in with their code.
