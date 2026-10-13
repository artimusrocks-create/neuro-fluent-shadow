import { NextResponse } from "next/server";
import { ANDROID_PACKAGE, androidFingerprints } from "@/lib/android";

/** Served at /.well-known/assetlinks.json (see next.config.mjs). */
export function GET() {
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: androidFingerprints() },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
