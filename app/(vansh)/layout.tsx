import type { Metadata, Viewport } from "next";
import { SPRITE_INNER } from "@/components/vansh/spriteInner";
import "./vansh.css";

export const metadata: Metadata = {
  title: "हाम्रो वंशावली",
  description: "परिवारको वंशावली — हेर्ने र अनुरोध पठाउने एप",
  manifest: "/manifest.json",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "वंशावली", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  themeColor: "#1A1A2E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// applies the saved theme before first paint (no flash)
const THEME_SCRIPT = `try{document.documentElement.dataset.theme=localStorage.getItem("vv_theme")||"light"}catch(e){document.documentElement.dataset.theme="light"}`;

export default function VanshLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ne" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+Devanagari:wght@500;600;700;900&family=Noto+Sans+Devanagari:wght@400;500;600;700;800&family=Playfair+Display:wght@700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <svg id="vv-sprite" width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SPRITE_INNER }} />
        {children}
      </body>
    </html>
  );
}
