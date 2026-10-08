import type { MetadataRoute } from "next";

// Makes the site installable: "Add to Home Screen" on iPhone, "Install app" on Android/Chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Neuro-Fluent · Шэдоуинг",
    short_name: "Шэдоуинг",
    description: "Повторяй за американцем, пока не заговоришь так же.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f2fb",
    theme_color: "#f4f2fb",
    lang: "ru",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
