import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth — Password-based authentication
 *
 * Validates the provided password against AUTH_PASSWORD env var.
 * On success, sets a httpOnly `cocolash-auth` cookie (30-day expiry).
 * On failure, returns 401.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const expectedPassword = process.env.AUTH_PASSWORD;

    if (!expectedPassword) {
      console.error("AUTH_PASSWORD environment variable is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (password !== expectedPassword) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // Password correct — set auth cookie
    const authToken = process.env.AUTH_TOKEN;

    if (!authToken) {
      console.error("AUTH_TOKEN environment variable is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const response = NextResponse.json(
      { success: true, message: "Welcome to CocoLash AI" },
      { status: 200 }
    );

    // Set httpOnly cookie with 30-day expiry
    response.cookies.set("cocolash-auth", authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/auth — Logout
 *
 * Clears the auth cookie and returns success.
 */
export async function DELETE() {
  const response = NextResponse.json(
    { success: true, message: "Logged out" },
    { status: 200 }
  );

  response.cookies.set("cocolash-auth", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0, // Expire immediately
  });

  return response;
}
