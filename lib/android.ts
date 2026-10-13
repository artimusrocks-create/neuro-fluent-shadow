// The Android app (a Trusted Web Activity: this website in full-screen Chrome, installed like an app).
// Android checks /.well-known/assetlinks.json to confirm the app and the site belong together;
// without it the app shows a browser address bar.

export const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || "com.neurofluent.shadow";

/** SHA-256 of the key that signed the APK (the "upload key", kept in your shadow-app-android folder). */
const UPLOAD_KEY = "6C:44:71:76:26:ED:BB:E7:B7:7B:E4:CC:33:2F:38:76:35:D6:20:CA:5E:EA:47:AF:7C:8B:96:63:3F:DA:0E:A9";

/** Google Play re-signs apps with its own key. Paste that one (Play Console → App integrity) into ANDROID_SHA256, comma-separated. */
export function androidFingerprints(): string[] {
  const extra = (process.env.ANDROID_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  return Array.from(new Set([UPLOAD_KEY, ...extra]));
}
