import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Gestão de Cozinha",
    short_name: "Cozinha",
    description: "Produção, feiras e estoque da cozinha.",
    lang: "pt-BR",
    start_url: "/producao/pasteis",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6fa",
    theme_color: "#234367",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

