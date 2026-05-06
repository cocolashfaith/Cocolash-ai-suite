import { createAdminClient } from "@/lib/supabase/server";
import { addChatAdmin, removeChatAdmin } from "./actions";
import RemoveAdminButton from "./remove-admin-button";

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
      <h1 className="text-2xl font-bold text-coco-brown">Manage Admins</h1>

      {/* Existing admins table */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-coco-brown-medium">
          Current Admins
        </h2>
        {admins.length === 0 ? (
          <p className="text-sm text-coco-brown-medium">No admins yet. Use the form below to add one.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-coco-beige">
            <table className="w-full text-sm">
              <thead className="border-b border-coco-beige bg-coco-beige">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-coco-brown">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-coco-brown">Role</th>
                  <th className="px-4 py-3 text-left font-semibold text-coco-brown">Added</th>
                  <th className="px-4 py-3 text-right font-semibold text-coco-brown">Action</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.auth_user_id} className="border-b border-coco-beige hover:bg-coco-beige/50">
                    <td className="px-4 py-3 text-coco-brown">{admin.email}</td>
                    <td className="px-4 py-3 capitalize text-coco-brown">{admin.role}</td>
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

      {/* Add admin form */}
      <div className="space-y-2 rounded-md border border-coco-beige p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-coco-brown-medium">
          Add a New Admin
        </h2>
        <p className="text-sm text-coco-brown-medium">
          Invite a teammate by email. They must have signed into the app at least once.
        </p>

        <form action={addChatAdmin} className="space-y-3 pt-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-coco-brown">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="team@example.com"
              className="rounded border border-coco-beige px-3 py-2 text-sm text-coco-brown placeholder-coco-brown-medium focus:border-coco-pink-soft focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="role" className="text-sm font-medium text-coco-brown">
              Role
            </label>
            <select
              id="role"
              name="role"
              className="rounded border border-coco-beige px-3 py-2 text-sm text-coco-brown focus:border-coco-pink-soft focus:outline-none"
            >
              <option value="team">Team Member</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded bg-coco-pink-soft px-4 py-2 text-sm font-medium text-coco-brown hover:bg-coco-pink transition-colors"
          >
            Add Admin
          </button>
        </form>
      </div>
    </div>
  );
}
