"use client";

import { useEffect, useState, useCallback } from "react";
import { Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

import { ImageCard } from "@/components/gallery/ImageCard";
import { ImageModal } from "@/components/gallery/ImageModal";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { CaptionModal } from "@/components/generate/CaptionModal";

import type { GeneratedImage } from "@/lib/types";

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export default function FavoritesPage() {
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const [captionImage, setCaptionImage] = useState<GeneratedImage | null>(null);

  const fetchFavorites = useCallback(async (page = 1, append = false) => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        favorite: "true",
        sortBy: "created_at",
        sortOrder: "desc",
      });

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
      toast.error("Failed to load favorites");
      console.error("Favorites fetch error:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchFavorites(1);
  }, [fetchFavorites]);

  const handleLoadMore = () => {
    if (pagination && pagination.hasMore) {
      fetchFavorites(pagination.page + 1, true);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/images?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      setImages((prev) => prev.filter((img) => img.id !== id));
      if (pagination) {
        setPagination({ ...pagination, total: pagination.total - 1 });
      }
      toast.success("Image deleted");
    } catch {
      toast.error("Failed to delete image");
    }
  };

  const handleFavoriteToggle = async (id: string) => {
    const image = images.find((img) => img.id === id);
    if (!image) return;

    const newFav = !image.is_favorite;

    // Optimistic update
    if (!newFav) {
      // Unfavoriting — remove from this list
      setImages((prev) => prev.filter((img) => img.id !== id));
      if (pagination) {
        setPagination({ ...pagination, total: pagination.total - 1 });
      }
    } else {
      setImages((prev) =>
        prev.map((img) =>
          img.id === id ? { ...img, is_favorite: newFav } : img
        )
      );
    }

    if (selectedImage?.id === id) {
      setSelectedImage({ ...selectedImage, is_favorite: newFav });
    }

    try {
      const response = await fetch(`/api/images/${id}/favorite`, {
        method: "PATCH",
      });
      if (!response.ok) throw new Error("Failed to update");
    } catch {
      // Revert — re-fetch to get clean state
      fetchFavorites(1);
      toast.error("Failed to update favorite");
    }
  };

  const openModal = (image: GeneratedImage) => {
    setSelectedImage(image);
    setModalOpen(true);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-coco-brown">Favorites</h1>
        <p className="mt-1 text-sm text-coco-brown-medium">
          Your saved favorite images
          {pagination && pagination.total > 0 && (
            <span className="ml-1 text-coco-brown-medium/50">
              ({pagination.total} image{pagination.total !== 1 ? "s" : ""})
            </span>
          )}
        </p>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-coco-beige-dark bg-white"
            >
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
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
            <Heart className="h-8 w-8 text-red-300" />
          </div>
          <p className="mt-4 text-sm font-medium text-coco-brown-medium/50">
            No favorites yet
          </p>
          <p className="mt-1 text-xs text-coco-brown-medium/30">
            Tap the heart icon on any image to save it here
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
                onFavoriteToggle={() => handleFavoriteToggle(image.id)}
                onDetailsClick={() => openModal(image)}
                onCaptionClick={() => setCaptionImage(image)}
              />
            ))}
          </div>

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
