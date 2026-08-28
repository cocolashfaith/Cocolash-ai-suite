import { createAdminClient } from "@/lib/supabase/server";
import RemoveAdminButton from "./remove-admin-button";
import { CreateAdminForm } from "./create-admin-form";

interface ChatAdminRow {
  auth_user_id: string;
  email: string;
  role: "owner" | "team";
  created_at: string;
}

export default async function ChatbotAdminAdminsPage() {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("chat_admin_users")
    .select("auth_user_id, email, role, created_at")
    .order("created_at", { ascending: true });

  const admins = (data ?? []) as ChatAdminRow[];

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-coco-brown">Manage Admins</h1>
        <p className="mt-1 text-sm text-coco-brown-medium">
          Everyone who can sign in and see customer conversations. Create individual logins and
          revoke access anytime.
        </p>
      </div>

      {/* Existing admins table */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-coco-brown-medium">
          Who has access
        </h2>
        {admins.length === 0 ? (
          <p className="text-sm text-coco-brown-medium">No individual logins yet. Create one below.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-coco-pink-soft bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-coco-pink-soft bg-coco-beige/70 text-left text-xs font-semibold uppercase tracking-wide text-coco-brown-medium">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Added</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr
                    key={admin.auth_user_id}
                    className="border-t border-coco-pink-soft/70 transition-colors hover:bg-coco-beige/40"
                  >
                    <td className="px-4 py-3 font-medium text-coco-brown">{admin.email}</td>
                    <td className="px-4 py-3 capitalize text-coco-brown-medium">{admin.role}</td>
                    <td className="px-4 py-3 text-coco-brown-medium">{formatDate(admin.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <RemoveAdminButton authUserId={admin.auth_user_id} email={admin.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateAdminForm />
    </div>
  );
}
