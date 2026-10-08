import type { MetadataRoute } from "next";

// Makes the site installable: "Add to Home Screen" on iPhone, "Install app" on Android/Chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Neuro-Fluent Shadow",
    short_name: "NF Shadow",
    description: "Шэдоуинг американского английского.",
    start_url: "/",
    display: "standalone",
    background_color: "#fcfbff",
    theme_color: "#fcfbff",
    lang: "ru",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
