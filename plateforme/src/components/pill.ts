import { buttonBase } from "./ui";

/** Boutons-pilules en capitales (chasse fixe), dans le style du club. */
const pill = `${buttonBase} border font-mono text-[11px] uppercase tracking-[0.18em] px-6 py-3.5`;
export const pillStyles = {
  dark: `${pill} border-ink bg-ink text-ivory hover:bg-feature hover:border-feature`,
  outline: `${pill} border-ink/25 text-ink hover:border-ink`,
  light: `${pill} border-ivory bg-ivory text-ink hover:bg-sand`,
  ghostLight: `${pill} border-ivory/40 text-ivory hover:border-ivory`,
};
