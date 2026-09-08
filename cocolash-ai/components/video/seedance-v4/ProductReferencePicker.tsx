"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Upload, Check, Package, Settings, Store, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputLimitsFor } from "./lib/mode-input-rules";
import type { SeedanceV4WizardState } from "./types";

/**
 * Step-1 product reference picker (Phase 34.1 R-34.1-03, extended for 2.5 D7/D8).
 *
 * Product images are the spine of the UGC flow — they are picked FIRST (before
 * the script) so the script can be grounded in the actual product, and so Step 2
 * can focus purely on the influencers. Two sources:
 *
 *   Library       — `product_reference_images` via GET /api/product-categories
 *                   (+ ad-hoc upload, saved for next time)
 *   Store products — live Shopify Storefront images via
 *                   GET /api/shopify/product-images, grouped by product
 *
 * Selection is bound to `state.ugcProductImageUrls`; the cap is the engine's
 * combined products+influencers budget minus the influencers already chosen
 * (30 on Seedance 2.5, 9 on 2.0).
 */

interface ProductRef {
  id: string;
  image_url: string;
  category_name: string;
}

interface ShopifyProduct {
  handle: string;
  title: string;
  productType: string;
  available: boolean;
  images: Array<{ url: string; alt: string | null; width?: number; height?: number }>;
}

interface ProductReferencePickerProps {
  state: SeedanceV4WizardState;
  setState: (
    update:
      | Partial<SeedanceV4WizardState>
      | ((prev: SeedanceV4WizardState) => Partial<SeedanceV4WizardState>)
  ) => void;
}

type Tab = "library" | "store";

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function ProductReferencePicker({ state, setState }: ProductReferencePickerProps) {
  const [tab, setTab] = useState<Tab>("library");
  const [images, setImages] = useState<ProductRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Store products (Shopify)
  const [storeProducts, setStoreProducts] = useState<ShopifyProduct[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const storeLoadedRef = useRef(false);

  const selected = state.ugcProductImageUrls ?? [];
  const influencerCount = state.ugcInfluencerImageUrls?.length ?? 0;
  const combinedCap = inputLimitsFor(state.engine, "ugc").ugcCombined;
  // products + influencers share one budget (30 on 2.5, 9 on 2.0).
  const maxProducts = Math.max(0, combinedCap - influencerCount);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/product-categories");
      const data = await res.json();
      if (res.ok && data.categories) {
        const all: ProductRef[] = [];
        for (const cat of data.categories) {
          for (const img of cat.images ?? []) {
            all.push({
              id: img.id,
              image_url: img.image_url,
              category_name: cat.name ?? "",
            });
          }
        }
        setImages(all);

        // Reconcile the persisted selection against the freshly-loaded library.
        // Phantom selections (deleted / re-uploaded / other environment) show up
        // in the count with no clickable tile, so drop them — but ONLY when the
        // URL looks like it came from the library in the first place. Store
        // product URLs live on the Shopify CDN and must survive.
        if (all.length > 0) {
          const libraryUrls = new Set(all.map((i) => i.image_url));
          const libraryOrigins = new Set(
            all.map((i) => originOf(i.image_url)).filter((o): o is string => !!o)
          );
          setState((prev) => {
            const current = prev.ugcProductImageUrls ?? [];
            const pruned = current.filter((u) => {
              if (libraryUrls.has(u)) return true;
              const origin = originOf(u);
              return !origin || !libraryOrigins.has(origin);
            });
            return pruned.length === current.length ? {} : { ugcProductImageUrls: pruned };
          });
        }
      }
    } catch {
      // non-fatal — picker just shows the empty state
    } finally {
      setLoading(false);
    }
  }, [setState]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const fetchStoreProducts = useCallback(async () => {
    setStoreLoading(true);
    setStoreError(null);
    try {
      const res = await fetch("/api/shopify/product-images");
      const data = (await res.json().catch(() => ({}))) as {
        products?: ShopifyProduct[];
        error?: string;
      };
      if (!res.ok) {
        setStoreError(
          data.error === "shopify_not_configured"
            ? "Shopify isn't connected yet — ask an admin to add the Storefront credentials."
            : "Couldn't reach Shopify just now. Try again in a moment."
        );
        return;
      }
      setStoreProducts(Array.isArray(data.products) ? data.products : []);
    } catch {
      setStoreError("Couldn't reach Shopify just now. Try again in a moment.");
    } finally {
      setStoreLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "store" && !storeLoadedRef.current) {
      storeLoadedRef.current = true;
      void fetchStoreProducts();
    }
  }, [tab, fetchStoreProducts]);

  function toggle(url: string) {
    // Any change to the product set invalidates cached vision facts — clearing
    // productFacts forces a fresh "extract once" on the next script generation.
    if (selected.includes(url)) {
      setState({
        ugcProductImageUrls: selected.filter((u) => u !== url),
        productFacts: undefined,
      });
      return;
    }
    if (selected.length >= maxProducts) {
      toast.error(
        influencerCount > 0
          ? `Products + influencers are capped at ${combinedCap} — remove an influencer first.`
          : `Maximum ${maxProducts} product images allowed.`
      );
      return;
    }
    setState({
      ugcProductImageUrls: [...selected, url],
      productFacts: undefined,
    });
  }

  /**
   * Remove an image from THIS picker's grid only (e.g. a wrong or duplicate
   * upload). This is a local, in-session removal — it does NOT delete the image
   * from Settings / the product library, so it reappears next time the picker
   * loads. If the image was selected, it's also dropped from the selection.
   */
  function removeImage(img: ProductRef) {
    setImages((prev) => prev.filter((i) => i.id !== img.id));
    if (selected.includes(img.image_url)) {
      setState({
        ugcProductImageUrls: selected.filter((u) => u !== img.image_url),
        productFacts: undefined,
      });
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const resetInput = () => {
      if (fileRef.current) fileRef.current.value = "";
    };
    if (picked.length === 0) return;

    // Validate each file; skip (don't abort the batch) on bad ones.
    const valid: File[] = [];
    for (const file of picked) {
      if (!file.type.startsWith("image/")) {
        toast.error(`"${file.name}" is not an image — skipped.`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" is over 10 MB — skipped.`);
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) {
      resetInput();
      return;
    }

    // Respect the remaining product slots.
    const remaining = maxProducts - selected.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${maxProducts} product images already selected.`);
      resetInput();
      return;
    }
    const toUpload = valid.slice(0, remaining);
    if (valid.length > remaining) {
      toast.warning(
        `Only ${remaining} more image${remaining === 1 ? "" : "s"} can be added (max ${maxProducts}).`
      );
    }

    setUploading(true);
    const newlySelected: string[] = [];
    let failures = 0;
    try {
      // Sequential on purpose: the first upload creates the "Custom Uploads"
      // category, so subsequent uploads reuse it (avoids a concurrent
      // category-create race in /api/products/upload).
      for (const file of toUpload) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/products/upload", {
            method: "POST",
            body: fd,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Upload failed");
          const newProduct: ProductRef = {
            id: data.image.id,
            image_url: data.image.image_url,
            category_name: data.image.category_name ?? "Custom Uploads",
          };
          setImages((prev) => [newProduct, ...prev]);
          newlySelected.push(newProduct.image_url);
          if (data.warning) toast.warning(data.warning);
        } catch (err) {
          failures += 1;
          toast.error(
            `${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`
          );
        }
      }

      if (newlySelected.length > 0) {
        setState({
          ugcProductImageUrls: [...selected, ...newlySelected].slice(0, maxProducts),
          productFacts: undefined,
        });
        if (failures === 0) {
          const n = newlySelected.length;
          toast.success(
            `${n} product image${n === 1 ? "" : "s"} added — saved for next time.`
          );
        }
      }
    } finally {
      setUploading(false);
      resetInput();
    }
  }

  const showEmptyState = !loading && images.length === 0;

  return (
    <section className="space-y-3 rounded-xl border-2 border-coco-beige-dark/50 bg-white/50 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-semibold text-coco-brown">
          Product Images <span className="text-coco-golden">*</span>
        </label>
        <p className="text-[11px] text-coco-brown-medium/60">
          Pick angles of the <strong>same</strong> product (2–4 works best).
        </p>
      </div>

      <p className="text-[11px] text-coco-brown-medium/60">
        These ground the script and become the product references sent to Seedance. The
        script is written from what these images actually show.
      </p>

      {/* Source tabs — saved library vs live store */}
      <div className="flex gap-1.5 rounded-lg bg-coco-beige/50 p-1">
        <TabBtn
          active={tab === "library"}
          onClick={() => setTab("library")}
          icon={Package}
          label="Library"
        />
        <TabBtn
          active={tab === "store"}
          onClick={() => setTab("store")}
          icon={Store}
          label="Store products"
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />

      {tab === "library" &&
        (loading ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
            <Loader2 className="h-4 w-4 animate-spin text-coco-brown-medium/40" />
            <span className="ml-2 text-xs text-coco-brown-medium/50">
              Loading products…
            </span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {/* Upload tile — always first so it's discoverable */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-coco-beige-dark bg-white text-coco-brown-medium/60 transition-all hover:border-coco-golden/40 hover:bg-coco-golden/5",
                  uploading && "opacity-50"
                )}
                title="Upload one or more product images"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-coco-golden" />
                ) : (
                  <>
                    <Upload className="h-5 w-5" />
                    <span className="text-[10px] font-medium">Upload</span>
                  </>
                )}
              </button>
              {images.map((img) => {
                const isSelected = selected.includes(img.image_url);
                return (
                  <div key={img.id} className="group relative aspect-square">
                    <button
                      type="button"
                      onClick={() => toggle(img.image_url)}
                      className={cn(
                        "relative h-full w-full overflow-hidden rounded-lg border-2 transition-all",
                        isSelected
                          ? "border-coco-golden ring-2 ring-coco-golden/30"
                          : "border-transparent hover:border-coco-golden/40"
                      )}
                      title={img.category_name}
                    >
                      {/* Supabase / CDN hosts are not in next.config remotePatterns. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.image_url}
                        alt={img.category_name}
                        className="h-full w-full object-cover"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-coco-golden/20">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden">
                            <Check className="h-3.5 w-3.5 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                    {/* Remove from this list only (stays saved in Settings). */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(img);
                      }}
                      className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-coco-brown/70 text-white shadow-sm backdrop-blur-sm transition-all hover:bg-red-500 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Remove from this list (stays in Settings)"
                      aria-label={`Remove ${img.category_name || "image"} from this list`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {showEmptyState && (
              <div className="rounded-lg border border-dashed border-coco-beige-dark bg-coco-beige-light/40 p-3 text-center">
                <Package className="mx-auto h-5 w-5 text-coco-brown-medium/40" />
                <p className="mt-1 text-[11px] text-coco-brown-medium/60">
                  No saved products yet. Upload one or more above, try the{" "}
                  <strong>Store products</strong> tab, or{" "}
                  <Link
                    href="/settings"
                    className="font-medium text-coco-golden hover:text-coco-golden-dark"
                  >
                    <Settings className="inline h-3 w-3" /> manage in Settings
                  </Link>
                  .
                </p>
              </div>
            )}
          </>
        ))}

      {tab === "store" && (
        <StoreProductsGrid
          products={storeProducts}
          loading={storeLoading}
          error={storeError}
          selected={selected}
          onToggle={toggle}
          onRetry={fetchStoreProducts}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-[11px] font-medium",
            selected.length > 0 ? "text-coco-golden" : "text-coco-brown-medium/50"
          )}
        >
          {selected.length > 0
            ? `${selected.length} / ${maxProducts} image${selected.length !== 1 ? "s" : ""} selected`
            : "Select at least one product image to generate a script."}
        </p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setState({ ugcProductImageUrls: [], productFacts: undefined })
            }
            className="shrink-0 text-[11px] font-medium text-coco-brown-medium/60 underline-offset-2 transition-colors hover:text-coco-golden hover:underline"
          >
            Clear selection
          </button>
        )}
      </div>
    </section>
  );
}

function StoreProductsGrid({
  products,
  loading,
  error,
  selected,
  onToggle,
  onRetry,
}: {
  products: ShopifyProduct[];
  loading: boolean;
  error: string | null;
  selected: string[];
  onToggle: (url: string) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
        <Loader2 className="h-4 w-4 animate-spin text-coco-brown-medium/40" />
        <span className="ml-2 text-xs text-coco-brown-medium/50">
          Loading store products…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border-2 border-dashed border-coco-beige-dark bg-coco-beige-light/40 p-4 text-center">
        <Store className="mx-auto h-5 w-5 text-coco-brown-medium/40" />
        <p className="mt-1 text-[11px] text-coco-brown-medium/70">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-[11px] font-medium text-coco-golden underline-offset-2 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-coco-beige-dark p-6">
        <Store className="h-6 w-6 text-coco-brown-medium/30" />
        <p className="mt-2 text-xs text-coco-brown-medium/50">
          No store products with usable images were returned.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {products.map((product) => (
        <div key={product.handle} className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-coco-brown">{product.title}</p>
            <p className="text-[10px] text-coco-brown-medium/50">
              {product.productType || "Product"}
              {product.available ? "" : " · sold out"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {product.images.map((img) => {
              const isSelected = selected.includes(img.url);
              return (
                <button
                  key={img.url}
                  type="button"
                  onClick={() => onToggle(img.url)}
                  title={img.alt ?? product.title}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-lg border-2 transition-all",
                    isSelected
                      ? "border-coco-golden ring-2 ring-coco-golden/30"
                      : "border-transparent hover:border-coco-golden/40"
                  )}
                >
                  {/* Shopify CDN is deliberately NOT in next.config remotePatterns. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.alt ?? product.title}
                    className="h-full w-full object-cover"
                  />
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-coco-golden/20">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coco-golden">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-medium transition-all",
        active
          ? "bg-white text-coco-brown shadow-sm"
          : "text-coco-brown-medium/50 hover:text-coco-brown-medium"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
