import { auth } from "@/lib/auth-server";

/** Points d'entrée Better Auth (liens reçus par email : activation, nouveau mot de passe). */
export async function GET(request: Request) {
  return auth().handler(request);
}
export async function POST(request: Request) {
  return auth().handler(request);
}
