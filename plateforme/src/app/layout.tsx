import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Cormorant_Garamond, Inter, Jost, Montserrat, Playfair_Display } from "next/font/google";
import { getAppearance, themeCss } from "@/lib/appearance";
import "./globals.css";

// Polices proposées dans Admin → Apparence (seules celles choisies sont réellement utilisées)
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["400", "500", "600"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], preload: false });
const bodoni = Bodoni_Moda({ variable: "--font-bodoni", subsets: ["latin"], preload: false });
const jost = Jost({ variable: "--font-jost", subsets: ["latin"], weight: ["300", "400", "500"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], preload: false });

const fontVars = [cormorant, playfair, bodoni, jost, inter, montserrat].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: { default: "The Body Club", template: "%s · The Body Club" },
  description: "Studio de Lagree — réservez vos cours en quelques secondes.",
  applicationName: "The Body Club",
  appleWebApp: { capable: true, title: "Body Club", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const appearance = await getAppearance();
  return (
    <html lang="fr" className={`${fontVars} h-full antialiased`}>
      <head>
        <style>{themeCss(appearance)}</style>
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
