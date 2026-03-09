"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserPlus,
  Trash2,
  Loader2,
  Mail,
  Lock,
  User,
  Shield,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  raw_user_meta_data: {
    full_name?: string;
    role?: string;
  };
}

const ADMIN_EMAIL = "admin@cocolash.com";

export function UserManager() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/users");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load users");
        return;
      }

      setUsers(data.users);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!newEmail || !newPassword) {
      setFormError("Email and password are required");
      return;
    }

    if (newPassword.length < 6) {
      setFormError("Password must be at least 6 characters");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          fullName: newFullName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Failed to create user");
        return;
      }

      setSuccess(`User ${newEmail} created successfully`);
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
      setShowForm(false);
      fetchUsers();
    } catch {
      setFormError("Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to remove ${email}? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(userId);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/users?userId=${userId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to delete user");
        return;
      }

      setSuccess(`User ${email} has been removed`);
      fetchUsers();
    } catch {
      setError("Failed to delete user");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className="border-coco-beige-dark bg-white shadow-sm">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coco-brown/10">
              <Users className="h-5 w-5 text-coco-brown" />
            </div>
            <div>
              <h3 className="text-base font-bold text-coco-brown">
                Team Members
              </h3>
              <p className="text-xs text-coco-brown-medium/60">
                Manage who can access CocoLash AI Studio
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              setShowForm(!showForm);
              setFormError(null);
            }}
            className="gap-1.5 bg-coco-golden text-xs text-white hover:bg-coco-golden-dark"
            size="sm"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add User
          </Button>
        </div>

        {success && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            {success}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mt-4 space-y-3 rounded-xl border border-coco-beige-dark bg-coco-beige/20 p-4"
          >
            <h4 className="text-sm font-semibold text-coco-brown">
              Add New Team Member
            </h4>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-coco-brown-medium">
                  Full Name
                </Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-coco-brown-medium/40" />
                  <Input
                    type="text"
                    placeholder="Jane Doe"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="h-9 border-coco-beige-dark bg-white pl-8 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-coco-brown-medium">
                  Email <span className="text-red-400">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-coco-brown-medium/40" />
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="h-9 border-coco-beige-dark bg-white pl-8 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-coco-brown-medium">
                  Password <span className="text-red-400">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-coco-brown-medium/40" />
                  <Input
                    type="password"
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-9 border-coco-beige-dark bg-white pl-8 text-sm"
                    required
                    minLength={6}
                  />
                </div>
              </div>
            </div>

            {formError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {formError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="submit"
                disabled={creating}
                className="gap-1.5 bg-coco-golden text-xs text-white hover:bg-coco-golden-dark"
                size="sm"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    Create User
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setFormError(null);
                }}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-coco-brown-medium/50">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="py-8 text-center text-sm text-coco-brown-medium/50">
              No users found
            </div>
          ) : (
            users.map((user) => {
              const isAdminUser = user.email === ADMIN_EMAIL;
              const name =
                user.raw_user_meta_data?.full_name || user.email?.split("@")[0];
              const isDeleting = deletingId === user.id;

              return (
                <div
                  key={user.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                    isAdminUser
                      ? "border-coco-golden/30 bg-coco-golden/5"
                      : "border-coco-beige-dark bg-white hover:bg-coco-beige/20"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      isAdminUser
                        ? "bg-coco-golden/20 text-coco-golden-dark"
                        : "bg-coco-beige text-coco-brown-medium"
                    )}
                  >
                    {name[0]?.toUpperCase() || "?"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-coco-brown">
                        {name}
                      </span>
                      {isAdminUser && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-coco-golden/40 px-1.5 py-0 text-[10px] text-coco-golden-dark"
                        >
                          <Shield className="h-2.5 w-2.5" />
                          Admin
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-coco-brown-medium/60">
                      {user.email}
                    </p>
                  </div>

                  <div className="hidden text-right sm:block">
                    <p className="text-[10px] text-coco-brown-medium/50">
                      Last sign in
                    </p>
                    <p className="text-xs text-coco-brown-medium">
                      {formatDate(user.last_sign_in_at)}
                    </p>
                  </div>

                  {!isAdminUser && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(user.id, user.email!)}
                      disabled={isDeleting}
                      className="h-8 w-8 shrink-0 p-0 text-red-400 hover:bg-red-50 hover:text-red-600"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
