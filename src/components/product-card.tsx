import Image from "next/image";
import Link from "next/link";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { formatPriceIqd, type Product } from "@/lib/products";

export interface ProductCardProps {
  readonly product: Product;
}

/**
 * Displays a catalog product card with fixed IQD pricing, details link, and add-to-cart action.
 */
export function ProductCard({ product }: ProductCardProps) {
  const formattedPrice = formatPriceIqd(product.priceIqd);

  return (
    <article className="flex h-full flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <div className="mb-4 overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
          <Image
            src={product.imageSrc}
            alt={product.imageAlt}
            width={400}
            height={300}
            unoptimized
            className="aspect-[4/3] h-auto w-full object-contain"
          />
        </div>
        <h2 className="mb-2 text-lg font-bold text-neutral-900 dark:text-neutral-100">
          {product.name}
        </h2>
        <p className="mb-3 text-base font-semibold text-emerald-700 dark:text-emerald-400">
          {formattedPrice}
        </p>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {product.description}
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <Link
          href={`/products/${product.id}`}
          className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          عرض التفاصيل
        </Link>
        <AddToCartButton productId={product.id} productName={product.name} />
      </div>
    </article>
  );
}
