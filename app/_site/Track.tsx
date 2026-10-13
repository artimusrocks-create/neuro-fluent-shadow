"use client";

import { useEffect } from "react";
import { trackOnce } from "@/lib/client";

/** Counts a page view on public pages (once a day per device). */
export default function Track({ event }: { event: "landing" | "seo" }) {
  useEffect(() => trackOnce(event), [event]);
  return null;
}
