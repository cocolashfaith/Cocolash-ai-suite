import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const authToken = process.env.AUTH_TOKEN;

    if (!authToken) {
      console.error("AUTH_TOKEN environment variable is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const response = NextResponse.json(
      {
        success: true,
        message: "Welcome to CocoLash AI",
        role: "admin",
        adminEmail: "admin@cocolash.com",
      },
      { status: 200 }
    );

    response.cookies.set("cocolash-auth", authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
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
 * Signs out of both Supabase Auth AND clears the legacy cookie.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Supabase signout may fail if no session — that's fine
  }

  const response = NextResponse.json(
    { success: true, message: "Logged out" },
    { status: 200 }
  );

  response.cookies.set("cocolash-auth", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
