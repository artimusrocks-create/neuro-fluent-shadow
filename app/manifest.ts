import type { MetadataRoute } from "next";

// Makes the site installable: "Add to Home Screen" on iPhone, "Install app" on Android/Chrome.
// The Android app from Google Play wraps this same site (see /android in the repo).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Neuro-Fluent Shadow",
    short_name: "NF Shadow",
    description: "Шэдоуинг американского английского: слушаешь, повторяешь, получаешь оценку.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fcfbff",
    theme_color: "#fcfbff",
    lang: "ru",
    dir: "ltr",
    categories: ["education"],
    prefer_related_applications: false,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Фраза дня", url: "/?p=today", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Наборы фраз", url: "/phrases", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
