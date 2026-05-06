"use client";

import { removeChatAdmin } from "./actions";

interface RemoveAdminButtonProps {
  authUserId: string;
  email: string;
}

export default function RemoveAdminButton({ authUserId, email }: RemoveAdminButtonProps) {
  const handleClick = async () => {
    if (!window.confirm(`Remove ${email} from admins?`)) {
      return;
    }
    await removeChatAdmin(authUserId);
  };

  return (
    <button
      onClick={handleClick}
      className="rounded px-2 py-1 text-xs font-medium text-coco-brown hover:bg-coco-pink-soft transition-colors"
    >
      Remove
    </button>
  );
}
