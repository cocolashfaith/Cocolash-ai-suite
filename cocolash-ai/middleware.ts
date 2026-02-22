import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * CocoLash AI — Auth Middleware
 *
 * Dual-auth strategy (M3 upgrade):
 *   1. Supabase Auth — checks for a valid Supabase session via @supabase/ssr
 *   2. Cookie fallback — checks `cocolash-auth` cookie (password-based, M1-M2 legacy)
 *
 * A user is considered authenticated if EITHER method succeeds.
 * This allows the existing password login to keep working while
 * transitioning to Supabase Auth (email/password).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicPaths = ["/login", "/api/auth", "/auth"];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  // Refresh Supabase session on every request (keeps tokens fresh)
  const { supabaseResponse, user: supabaseUser } =
    await updateSession(request);

  // Check legacy cookie auth
  const authCookie = request.cookies.get("cocolash-auth")?.value;
  const expectedToken = process.env.AUTH_TOKEN;
  const hasLegacyCookie =
    !!authCookie && !!expectedToken && authCookie === expectedToken;

  const isAuthenticated = !!supabaseUser || hasLegacyCookie;

  if (isPublicPath) {
    if (pathname.startsWith("/login") && isAuthenticated) {
      return NextResponse.redirect(new URL("/generate", request.url));
    }
    return supabaseResponse;
  }

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
