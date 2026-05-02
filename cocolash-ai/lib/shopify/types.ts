/**
 * Shopify Storefront API — internal types.
 * Cross-cutting product types used by widget + chat live in lib/types/index.ts.
 */

export type ShopifyErrorCode =
  | "missing_api_key"
  | "rate_limited"
  | "graphql_error"
  | "not_found"
  | "network_error"
  | "invalid_hmac";

export class ShopifyError extends Error {
  public readonly status: number;
  public readonly code: ShopifyErrorCode;
  constructor(message: string, status: number, code: ShopifyErrorCode) {
    super(message);
    this.name = "ShopifyError";
    this.status = status;
    this.code = code;
  }
}

export interface ShopifyProductImage {
  url: string;
  altText: string | null;
}

export interface ShopifyProductVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  price: {
    amount: string;
    currencyCode: string;
  };
}

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  productType: string;
  tags: string[];
  totalInventory: number | null;
  availableForSale: boolean;
  featuredImage: ShopifyProductImage | null;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  };
  variants: ShopifyProductVariant[];
}

/** Compact shape sent over SSE to the widget. */
export interface ProductCard {
  handle: string;
  title: string;
  description: string;
  image: { url: string; alt: string } | null;
  priceFrom: string;
  priceTo: string;
  currency: string;
  available: boolean;
  productUrl: string;
  /** Stage 1 deep link; Stage 2 swaps to App Proxy mutation. */
  addToCartUrl: string;
}
