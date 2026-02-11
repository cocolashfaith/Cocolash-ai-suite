import { NextResponse, type NextRequest } from "next/server";

/**
 * CocoLash AI — Auth Middleware
 *
 * Simple cookie-based authentication for M1-M2.
 * Checks for a valid `cocolash-auth` cookie on every request.
 * If missing or invalid, redirects to /login.
 *
 * Excluded paths: /login, /api/auth, _next/*, favicon, public assets
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow these paths without auth
  const publicPaths = ["/login", "/api/auth"];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  if (isPublicPath) {
    // If user is already authenticated and tries to visit /login, redirect to /generate
    if (pathname.startsWith("/login")) {
      const authCookie = request.cookies.get("cocolash-auth")?.value;
      const expectedToken = process.env.AUTH_TOKEN;

      if (authCookie && expectedToken && authCookie === expectedToken) {
        return NextResponse.redirect(new URL("/generate", request.url));
      }
    }
    return NextResponse.next();
  }

  // Check auth cookie
  const authCookie = request.cookies.get("cocolash-auth")?.value;
  const expectedToken = process.env.AUTH_TOKEN;

  if (!authCookie || !expectedToken || authCookie !== expectedToken) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets (svg, png, jpg, jpeg, gif, webp, ico)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
