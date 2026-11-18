import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/compte", "/admin", "/prof"];

/**
 * Redirige vers la connexion quand il n'y a aucune session pour les espaces protégés.
 * Simple présence du cookie (rapide, sans base) : la session elle-même et le RÔLE
 * sont vérifiés côté serveur dans chaque page et action, puis par la RLS.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PROTECTED.some((p) => path === p || path.startsWith(`${p}/`)) && !getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    url.searchParams.set("suite", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/compte/:path*", "/admin/:path*", "/prof/:path*"],
};
