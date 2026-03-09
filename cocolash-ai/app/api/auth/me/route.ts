import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ADMIN_EMAIL = "admin@cocolash.com";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ user: null, isAdmin: false });
    }

    const isAdmin =
      user.email === ADMIN_EMAIL || user.user_metadata?.role === "admin";

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.user_metadata?.full_name || null,
      },
      isAdmin,
    });
  } catch {
    return NextResponse.json({ user: null, isAdmin: false });
  }
}
