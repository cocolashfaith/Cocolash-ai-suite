import { useState } from "preact/hooks";

interface ProductCard {
  handle: string;
  title: string;
  description: string;
  image: { url: string; alt: string } | null;
  priceFrom: string;
  priceTo: string;
  currency: string;
  available: boolean;
  productUrl: string;
  addToCartUrl: string;
  /** Only wearable lashes get the "See it on you" button (server-computed). */
  tryOnEligible?: boolean;
}

interface ProductCardsProps {
  products: ProductCard[];
  onTryOn?: (handle: string, title: string) => void;
}

function priceLabel(p: ProductCard): string {
  if (p.priceFrom === p.priceTo) return `$${p.priceFrom}`;
  return `$${p.priceFrom}–$${p.priceTo}`;
}

/**
 * Product image with a graceful fallback. If the image is missing OR fails to
 * load (404, slow/blocked CDN), render the styled placeholder instead of a
 * broken/blank <img>. Fixes the "product image sometimes loads blank" report.
 */
function ProductImage({ image, title }: { image: ProductCard["image"]; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) {
    return <div class="product-card__img product-card__img--placeholder" aria-hidden="true" />;
  }
  return (
    <img
      class="product-card__img"
      src={image.url}
      alt={image.alt || title}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function ProductCards({ products, onTryOn }: ProductCardsProps) {
  if (products.length === 0) return null;
  return (
    <div class="products" role="list">
      {products.map((p) => (
        <article key={p.handle} class="product-card" role="listitem">
          <ProductImage image={p.image} title={p.title} />
          <div class="product-card__body">
            <h3 class="product-card__title">{p.title}</h3>
            <p class="product-card__price">
              {priceLabel(p)} <span class="product-card__currency">{p.currency}</span>
              {p.available ? null : <span class="product-card__oos"> · out of stock</span>}
            </p>
            <p class="product-card__desc">{p.description}</p>
            <div class="product-card__actions">
              <a
                class="product-card__btn product-card__btn--secondary"
                href={p.productUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View
              </a>
              {p.available && p.addToCartUrl ? (
                <a
                  class="product-card__btn product-card__btn--primary"
                  href={p.addToCartUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add to cart
                </a>
              ) : null}
            </div>
            {onTryOn && p.tryOnEligible ? (
              <button
                type="button"
                class="product-card__tryon"
                onClick={() => onTryOn(p.handle, p.title)}
              >
                ✨ See it on you
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
