"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Hashtag, Platform } from "@/lib/types";
import {
  Hash,
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  Search,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

const CATEGORIES = [
  "brand",
  "cocolash-kit",
  "lash-styles",
  "occasions",
  "seasonal",
  "general-beauty",
  "community-engagement",
  "application-tips",
  "trending-viral",
  "melanin-beauty",
  "eye-makeup",
  "self-care-wellness",
  "confidence-empowerment",
  "makeup-looks-aesthetics",
  "beauty-creator-influencer",
  "shopping-hauls",
  "daily-routines-lifestyle",
  "beauty-quotes-inspiration",
  "product-review",
] as const;

const ALL_PLATFORMS: Platform[] = [
  "instagram",
  "tiktok",
  "twitter",
  "facebook",
  "linkedin",
];

const PLATFORM_COLORS: Record<Platform, string> = {
  instagram: "bg-purple-500 text-white",
  tiktok: "bg-black text-white",
  twitter: "bg-blue-500 text-white",
  facebook: "bg-blue-700 text-white",
  linkedin: "bg-blue-600 text-white",
};

const PER_PAGE = 50;

interface AlertState {
  type: "success" | "error";
  message: string;
}

interface NewHashtagForm {
  tag: string;
  category: string;
  sub_category: string;
  platforms: Platform[];
  popularity_score: number;
  is_branded: boolean;
}

const emptyForm: NewHashtagForm = {
  tag: "",
  category: "brand",
  sub_category: "",
  platforms: ["instagram"],
  popularity_score: 50,
  is_branded: false,
};

function formatCategory(cat: string): string {
  return cat
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function HashtagManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [hashtags, setHashtags] = useState<Hashtag[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const [showAddRow, setShowAddRow] = useState(false);
  const [newForm, setNewForm] = useState<NewHashtagForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NewHashtagForm>({ ...emptyForm });
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [alert, setAlert] = useState<AlertState | null>(null);
  const alertTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const showAlert = useCallback((type: "success" | "error", message: string) => {
    if (alertTimeout.current) clearTimeout(alertTimeout.current);
    setAlert({ type, message });
    alertTimeout.current = setTimeout(() => setAlert(null), 4000);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const fetchHashtags = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (activeFilter !== "all") params.set("isActive", activeFilter === "active" ? "true" : "false");

      const res = await fetch(`/api/hashtags?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setHashtags(data.hashtags ?? []);
      setTotalCount(data.total ?? 0);
    } catch {
      showAlert("error", "Failed to load hashtags");
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter, debouncedSearch, activeFilter, showAlert]);

  useEffect(() => {
    if (isOpen) fetchHashtags();
  }, [isOpen, fetchHashtags]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  const handleAdd = async () => {
    if (!newForm.tag.trim()) return;
    setSaving(true);
    try {
      const body = {
        tag: newForm.tag.startsWith("#") ? newForm.tag : `#${newForm.tag}`,
        category: newForm.category,
        sub_category: newForm.sub_category || null,
        platforms: newForm.platforms,
        popularity_score: newForm.popularity_score,
        is_branded: newForm.is_branded,
      };
      const res = await fetch("/api/hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add");
      }
      showAlert("success", "Hashtag added successfully");
      setShowAddRow(false);
      setNewForm({ ...emptyForm });
      await fetchHashtags();
    } catch (e) {
      showAlert("error", e instanceof Error ? e.message : "Failed to add hashtag");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (h: Hashtag) => {
    setEditingId(h.id);
    setEditForm({
      tag: h.tag,
      category: h.category,
      sub_category: h.sub_category || "",
      platforms: h.platform,
      popularity_score: h.popularity_score,
      is_branded: h.is_branded,
    });
  };

  const handleEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    try {
      const body = {
        tag: editForm.tag.startsWith("#") ? editForm.tag : `#${editForm.tag}`,
        category: editForm.category,
        sub_category: editForm.sub_category || null,
        platforms: editForm.platforms,
        popularity_score: editForm.popularity_score,
        is_branded: editForm.is_branded,
      };
      const res = await fetch(`/api/hashtags/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");
      showAlert("success", "Hashtag updated");
      setEditingId(null);
      await fetchHashtags();
    } catch {
      showAlert("error", "Failed to update hashtag");
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleActive = async (h: Hashtag) => {
    try {
      const res = await fetch(`/api/hashtags/${h.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !h.is_active }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      setHashtags((prev) =>
        prev.map((item) =>
          item.id === h.id ? { ...item, is_active: !item.is_active } : item
        )
      );
    } catch {
      showAlert("error", "Failed to toggle active state");
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/hashtags/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      showAlert("success", "Hashtag deleted");
      await fetchHashtags();
    } catch {
      showAlert("error", "Failed to delete hashtag");
    } finally {
      setDeletingId(null);
    }
  };

  const togglePlatform = (
    platforms: Platform[],
    p: Platform,
    setter: (fn: (prev: NewHashtagForm) => NewHashtagForm) => void
  ) => {
    setter((prev) => ({
      ...prev,
      platforms: platforms.includes(p)
        ? platforms.filter((x) => x !== p)
        : [...platforms, p],
    }));
  };

  return (
    <div className="rounded-xl border border-coco-pink-dark/20 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-coco-beige/30"
      >
        <Hash className="h-5 w-5 text-coco-golden" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-coco-brown">
            Hashtag Database
          </h3>
          <p className="text-sm text-coco-brown-medium">
            Manage hashtags used for AI-generated captions across all platforms.
          </p>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-coco-brown-medium/50" />
        ) : (
          <ChevronDown className="h-5 w-5 text-coco-brown-medium/50" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-coco-pink-dark/20 px-5 pb-5 pt-4">
          {alert && (
            <div
              className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
                alert.type === "success"
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {alert.type === "success" ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {alert.message}
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Badge
              variant="secondary"
              className="bg-coco-beige text-xs text-coco-brown-medium"
            >
              {totalCount} total
            </Badge>

            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-coco-brown-medium/40" />
              <Input
                placeholder="Search hashtags..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm border-coco-pink-dark/30 bg-white text-coco-brown placeholder:text-coco-brown-medium/40"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-md border border-coco-pink-dark/30 bg-white px-2 text-sm text-coco-brown focus:outline-none focus:ring-2 focus:ring-coco-golden/50"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {formatCategory(c)}
                </option>
              ))}
            </select>

            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value as "all" | "active" | "inactive");
                setPage(1);
              }}
              className="h-8 rounded-md border border-coco-pink-dark/30 bg-white px-2 text-sm text-coco-brown focus:outline-none focus:ring-2 focus:ring-coco-golden/50"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <Button
              type="button"
              size="sm"
              onClick={() => {
                setShowAddRow(true);
                setNewForm({ ...emptyForm });
              }}
              className="ml-auto bg-coco-golden font-semibold text-white hover:bg-coco-golden-dark"
            >
              <Plus className="h-4 w-4" />
              Add Hashtag
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-coco-pink-dark/15">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-coco-pink-dark/15 bg-coco-beige/40">
                      <th className="px-3 py-2.5 text-left font-medium text-coco-brown-medium">
                        Tag
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium text-coco-brown-medium">
                        Category
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium text-coco-brown-medium">
                        Platforms
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium text-coco-brown-medium">
                        Popularity
                      </th>
                      <th className="px-3 py-2.5 text-center font-medium text-coco-brown-medium">
                        Branded
                      </th>
                      <th className="px-3 py-2.5 text-center font-medium text-coco-brown-medium">
                        Active
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium text-coco-brown-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {showAddRow && (
                      <tr className="border-b border-coco-golden/20 bg-coco-golden/5">
                        <td className="px-3 py-2">
                          <Input
                            value={newForm.tag}
                            onChange={(e) =>
                              setNewForm((p) => ({ ...p, tag: e.target.value }))
                            }
                            placeholder="#NewTag"
                            className="h-7 w-32 text-xs border-coco-pink-dark/30"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={newForm.category}
                            onChange={(e) =>
                              setNewForm((p) => ({
                                ...p,
                                category: e.target.value,
                              }))
                            }
                            className="h-7 rounded border border-coco-pink-dark/30 bg-white px-1.5 text-xs text-coco-brown"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {formatCategory(c)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {ALL_PLATFORMS.map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() =>
                                  togglePlatform(newForm.platforms, p, setNewForm)
                                }
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity ${
                                  PLATFORM_COLORS[p]
                                } ${
                                  newForm.platforms.includes(p)
                                    ? "opacity-100"
                                    : "opacity-30"
                                }`}
                              >
                                {p.slice(0, 2).toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={newForm.popularity_score}
                            onChange={(e) =>
                              setNewForm((p) => ({
                                ...p,
                                popularity_score: Number(e.target.value),
                              }))
                            }
                            className="h-7 w-16 text-xs border-coco-pink-dark/30"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={newForm.is_branded}
                            onChange={(e) =>
                              setNewForm((p) => ({
                                ...p,
                                is_branded: e.target.checked,
                              }))
                            }
                            className="h-4 w-4 rounded accent-coco-golden"
                          />
                        </td>
                        <td />
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={handleAdd}
                              disabled={saving || !newForm.tag.trim()}
                              className="text-green-600 hover:bg-green-50"
                            >
                              {saving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setShowAddRow(false)}
                              className="text-coco-brown-medium hover:bg-coco-beige"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {hashtags.length === 0 && !showAddRow ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-12 text-center text-coco-brown-medium"
                        >
                          <Hash className="mx-auto mb-2 h-8 w-8 text-coco-brown-medium/30" />
                          <p className="font-medium">No hashtags found</p>
                          <p className="mt-1 text-xs text-coco-brown-medium/60">
                            Try adjusting your filters or add a new hashtag.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      hashtags.map((h) => {
                        const isEditing = editingId === h.id;

                        if (isEditing) {
                          return (
                            <tr
                              key={h.id}
                              className="border-b border-coco-golden/20 bg-coco-golden/5"
                            >
                              <td className="px-3 py-2">
                                <Input
                                  value={editForm.tag}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      tag: e.target.value,
                                    }))
                                  }
                                  className="h-7 w-32 text-xs border-coco-pink-dark/30"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={editForm.category}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      category: e.target.value,
                                    }))
                                  }
                                  className="h-7 rounded border border-coco-pink-dark/30 bg-white px-1.5 text-xs text-coco-brown"
                                >
                                  {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                      {formatCategory(c)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {ALL_PLATFORMS.map((p) => (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() =>
                                        togglePlatform(
                                          editForm.platforms,
                                          p,
                                          setEditForm
                                        )
                                      }
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity ${
                                        PLATFORM_COLORS[p]
                                      } ${
                                        editForm.platforms.includes(p)
                                          ? "opacity-100"
                                          : "opacity-30"
                                      }`}
                                    >
                                      {p.slice(0, 2).toUpperCase()}
                                    </button>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={editForm.popularity_score}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      popularity_score: Number(e.target.value),
                                    }))
                                  }
                                  className="h-7 w-16 text-xs border-coco-pink-dark/30"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={editForm.is_branded}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      is_branded: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 rounded accent-coco-golden"
                                />
                              </td>
                              <td />
                              <td className="px-3 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={handleEdit}
                                    disabled={editSaving}
                                    className="text-green-600 hover:bg-green-50"
                                  >
                                    {editSaving ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => setEditingId(null)}
                                    className="text-coco-brown-medium hover:bg-coco-beige"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr
                            key={h.id}
                            className="border-b border-coco-pink-dark/10 transition-colors hover:bg-coco-beige/20"
                          >
                            <td className="px-3 py-2.5 font-medium text-coco-brown">
                              {h.tag}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-coco-brown-medium">
                              {formatCategory(h.category)}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {h.platform.map((p) => (
                                  <span
                                    key={p}
                                    className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${PLATFORM_COLORS[p]}`}
                                  >
                                    {p.charAt(0).toUpperCase() + p.slice(1)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-coco-beige">
                                  <div
                                    className="h-full rounded-full bg-coco-golden transition-all"
                                    style={{
                                      width: `${h.popularity_score}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-coco-brown-medium">
                                  {h.popularity_score}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {h.is_branded ? (
                                <Badge
                                  variant="secondary"
                                  className="bg-coco-golden/15 text-[10px] text-coco-golden"
                                >
                                  Branded
                                </Badge>
                              ) : (
                                <span className="text-xs text-coco-brown-medium/40">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleActive(h)}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                  h.is_active
                                    ? "bg-coco-golden"
                                    : "bg-coco-brown-medium/20"
                                }`}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                    h.is_active
                                      ? "translate-x-[18px]"
                                      : "translate-x-[3px]"
                                  }`}
                                />
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => startEdit(h)}
                                  className="text-coco-brown-medium hover:bg-coco-beige hover:text-coco-brown"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => handleDelete(h.id)}
                                  disabled={deletingId === h.id}
                                  className="text-red-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  {deletingId === h.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="border-coco-pink-dark/30 text-coco-brown"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-coco-brown-medium">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="border-coco-pink-dark/30 text-coco-brown"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
