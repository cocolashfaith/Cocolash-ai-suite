"use client";

import { useEffect, useState, useCallback } from "react";
import { Images, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

import { GalleryFilters } from "@/components/gallery/GalleryFilters";
import { ImageCard } from "@/components/gallery/ImageCard";
import { ImageModal } from "@/components/gallery/ImageModal";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { CaptionModal } from "@/components/generate/CaptionModal";

import type { GeneratedImage, ContentCategory } from "@/lib/types";

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export default function GalleryPage() {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [category, setCategory] = useState<ContentCategory | "all">("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Modal
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Lightbox
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);

  // Caption modal
  const [captionImage, setCaptionImage] = useState<GeneratedImage | null>(null);

  // Fetch images
  const fetchImages = useCallback(
    async (page = 1, append = false) => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: "20",
          sortBy: "created_at",
          sortOrder: "desc",
        });

        if (category !== "all") {
          params.set("category", category);
        }
        if (favoritesOnly) {
          params.set("favorite", "true");
        }

        const response = await fetch(`/api/images?${params}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        if (append) {
          setImages((prev) => [...prev, ...data.images]);
        } else {
          setImages(data.images);
        }
        setPagination(data.pagination);
      } catch (err) {
        toast.error("Failed to load images");
        console.error("Gallery fetch error:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, favoritesOnly]
  );

  // Load on mount and filter change
  useEffect(() => {
    fetchImages(1);
  }, [fetchImages]);

  // Load more
  const handleLoadMore = () => {
    if (pagination && pagination.hasMore) {
      fetchImages(pagination.page + 1, true);
    }
  };

  // Delete image
  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/images?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      setImages((prev) => prev.filter((img) => img.id !== id));
      if (pagination) {
        setPagination({ ...pagination, total: pagination.total - 1 });
      }
    } catch {
      toast.error("Failed to delete image");
    }
  };

  // Toggle favorite — called by FavoriteButton (optimistic, already hit API)
  const handleFavoriteToggle = (id: string, newValue?: boolean) => {
    const image = images.find((img) => img.id === id);
    if (!image) return;

    const newFav = newValue !== undefined ? newValue : !image.is_favorite;

    setImages((prev) =>
      prev.map((img) =>
        img.id === id ? { ...img, is_favorite: newFav } : img
      )
    );

    if (selectedImage?.id === id) {
      setSelectedImage({ ...selectedImage, is_favorite: newFav });
    }
  };

  // Open modal
  const openModal = (image: GeneratedImage) => {
    setSelectedImage(image);
    setModalOpen(true);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-coco-brown">Gallery</h1>
        <p className="mt-1 text-sm text-coco-brown-medium">
          Browse and manage your generated images
          {pagination && pagination.total > 0 && (
            <span className="ml-1 text-coco-brown-medium/50">
              ({pagination.total} image{pagination.total !== 1 ? "s" : ""})
            </span>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <GalleryFilters
          category={category}
          onCategoryChange={setCategory}
          favoritesOnly={favoritesOnly}
          onFavoritesChange={setFavoritesOnly}
        />
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-coco-beige-dark bg-white">
              <Skeleton className="aspect-[4/5] w-full" />
              <div className="flex items-center justify-between px-3 py-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && images.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-coco-beige-dark bg-white/50 py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-coco-golden/10">
            <Images className="h-8 w-8 text-coco-golden/40" />
          </div>
          <p className="mt-4 text-sm font-medium text-coco-brown-medium/50">
            {favoritesOnly
              ? "No favorite images yet"
              : category !== "all"
                ? `No ${category.replace("-", " ")} images yet`
                : "No images generated yet"}
          </p>
          <p className="mt-1 text-xs text-coco-brown-medium/30">
            Head to the Generate page to create your first image
          </p>
        </div>
      )}

      {/* Image grid */}
      {!loading && images.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image) => (
              <ImageCard
                key={image.id}
                image={image}
                onClick={() => setLightboxImage(image)}
                onFavoriteToggle={handleFavoriteToggle}
                onDetailsClick={() => openModal(image)}
                onCaptionClick={() => setCaptionImage(image)}
              />
            ))}
          </div>

          {/* Load more */}
          {pagination?.hasMore && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="gap-2 border-coco-brown-medium/20"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Image detail modal */}
      <ImageModal
        image={selectedImage}
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedImage(null);
        }}
        onDelete={handleDelete}
        onFavoriteToggle={handleFavoriteToggle}
      />

      {/* Full-screen lightbox */}
      <ImageLightbox
        src={lightboxImage?.image_url ?? null}
        alt={lightboxImage ? `Generated ${lightboxImage.category} image` : ""}
        isOpen={!!lightboxImage}
        onClose={() => setLightboxImage(null)}
        downloadFilename={
          lightboxImage
            ? `cocolash-${lightboxImage.category}-${lightboxImage.aspect_ratio.replace(":", "x")}.png`
            : undefined
        }
      />

      {/* Caption & Publish modal */}
      {captionImage && (
        <CaptionModal
          open={!!captionImage}
          onClose={() => setCaptionImage(null)}
          imageId={captionImage.id}
          imageUrl={captionImage.image_url}
        />
      )}
    </div>
  );
}
