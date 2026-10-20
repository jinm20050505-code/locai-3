import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { id: "/", name: "LocAI 地元の野菜", short_name: "LocAI", description: "地元の野菜を、必要な量だけ", lang: "ja", start_url: "/", scope: "/", display: "standalone", background_color: "#ffffff", theme_color: "#00873c", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" }] };
}
