"use client";

import { ReactNode, useEffect, useState } from "react";
import { isStoreApp } from "@/lib/client";

/** Hides prices and "buy" buttons inside the Google Play app (Play's payment rules). */
export default function StoreHide({ children }: { children: ReactNode }) {
  const [hide, setHide] = useState(false);
  useEffect(() => setHide(isStoreApp()), []);
  return hide ? null : <>{children}</>;
}
