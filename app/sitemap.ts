import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { PHRASES } from "@/lib/phrases";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly" = "monthly") => ({ url: `${SITE_URL}${path}`, lastModified: now, changeFrequency, priority });
  return [
    page("/start", 1, "weekly"),
    page("/", 0.9, "weekly"),
    page("/phrases", 0.8, "weekly"),
    ...PHRASES.map((p) => page(`/phrase/${p.slug}`, 0.7)),
    page("/download", 0.5),
    page("/terms", 0.2, "yearly"),
    page("/privacy", 0.2, "yearly"),
  ];
}
