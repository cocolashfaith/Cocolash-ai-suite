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
}

interface ProductCardsProps {
  products: ProductCard[];
  onTryOn?: (handle: string, title: string) => void;
}

function priceLabel(p: ProductCard): string {
  if (p.priceFrom === p.priceTo) return `$${p.priceFrom}`;
  return `$${p.priceFrom}–$${p.priceTo}`;
}

export function ProductCards({ products, onTryOn }: ProductCardsProps) {
  if (products.length === 0) return null;
  return (
    <div class="products" role="list">
      {products.map((p) => (
        <article key={p.handle} class="product-card" role="listitem">
          {p.image ? (
            <img
              class="product-card__img"
              src={p.image.url}
              alt={p.image.alt}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div class="product-card__img product-card__img--placeholder" aria-hidden="true" />
          )}
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
            {onTryOn ? (
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
