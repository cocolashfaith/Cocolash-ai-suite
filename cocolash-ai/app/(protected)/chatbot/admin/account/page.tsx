import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-coco-brown">Account</h1>
        <p className="mt-1 text-sm text-coco-brown-medium">Manage your personal login.</p>
      </div>
      <AccountForm email={user?.email ?? null} />
    </div>
  );
}
