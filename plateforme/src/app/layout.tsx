import type { Metadata, Viewport } from "next";
import {
  Big_Shoulders, Bodoni_Moda, Cormorant_Garamond, Geist, Geist_Mono, Instrument_Serif, Inter, Jost, Montserrat,
  Playfair_Display,
} from "next/font/google";
import { brandName, getAppearance, themeCss } from "@/lib/appearance";
import "./globals.css";

// Identité du club : titres condensés, accents en italique, texte Geist, étiquettes en mono
const bigShoulders = Big_Shoulders({ variable: "--font-bigshoulders", subsets: ["latin"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Polices alternatives proposées dans Admin → Site internet
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["400", "500", "600"], preload: false });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], preload: false });
const bodoni = Bodoni_Moda({ variable: "--font-bodoni", subsets: ["latin"], preload: false });
const jost = Jost({ variable: "--font-jost", subsets: ["latin"], weight: ["300", "400", "500"], preload: false });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], preload: false });

const fontVars = [bigShoulders, instrument, geist, geistMono, cormorant, playfair, bodoni, jost, inter, montserrat]
  .map((f) => f.variable).join(" ");

export async function generateMetadata(): Promise<Metadata> {
  const a = await getAppearance();
  const name = brandName(a);
  return {
    title: { default: name, template: `%s · ${name}` },
    description: a.hero_subtitle,
    applicationName: name,
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#f0eadb",
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
