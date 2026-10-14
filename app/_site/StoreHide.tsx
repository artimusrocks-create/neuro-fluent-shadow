"use client";

import { ReactNode, useEffect, useState } from "react";
import { isStoreApp } from "@/lib/client";

/**
 * Prices, payment methods and APK downloads: hidden inside the Google Play app (Play's rules).
 * Hidden until the check runs, so they never flash inside the app.
 */
export default function StoreHide({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!isStoreApp()), []);
  return show ? <>{children}</> : null;
}
