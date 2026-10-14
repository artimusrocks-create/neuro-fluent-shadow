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

## Rebuild (new version, new icon, new address)

**Automatic (recommended).** GitHub builds and signs the app for you:

1. Once: add two secrets in GitHub → Settings → Secrets and variables → Actions:
   `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD` (both are in the Google Drive folder
   "Neuro-Fluent Shadow - ANDROID KEY").
2. Raise `appVersionCode` by 1 and set `appVersionName` (e.g. `1.0.1`) in `twa-manifest.json`, commit.
3. Push a tag `android-v1.0.1`, or open GitHub → Actions → **Android app** → Run workflow.
4. Download the signed `.apk` (for the website) and `.aab` (for Google Play) from the run, or from the Release the tag creates.

Changed the site address or icon? Also update `host`, `iconUrl`, `maskableIconUrl`, `webManifestUrl`, `fullScopeUrl`
here and the matching values in `app/build.gradle`.

**By hand (fallback).** Needs Node 20+; Bubblewrap installs Java and the Android SDK the first time:

```bash
npx @bubblewrap/cli update      # regenerates the project from twa-manifest.json
npx @bubblewrap/cli build       # asks for the keystore password, outputs app-release-signed.apk and app-release-bundle.aab
```

## Google Play

Upload the `.aab` file. After the first upload, Play Console → **Test and release → App integrity** shows the
**App signing key certificate SHA-256**. Add it to Vercel as `ANDROID_SHA256` (comma-separated if several) and
redeploy, otherwise the Play version shows a browser address bar.

Georgia can't have a Google Play merchant account, so the Play version is free: no prices or "buy" buttons inside it.
People subscribe on the website or in Telegram, then log in with their code.
