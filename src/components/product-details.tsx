import Image from "next/image";
import Link from "next/link";
import { formatPriceIqd, type Product } from "@/lib/products";

export interface ProductDetailsProps {
  readonly product: Product;
}

/**
 * Displays the full Arabic RTL details view for a single validated product.
 */
export function ProductDetails({ product }: ProductDetailsProps) {
  const formattedPrice = formatPriceIqd(product.priceIqd);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="التنقل" className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
        >
          العودة إلى الكتالوج
        </Link>
      </nav>

      <article className="grid gap-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm md:grid-cols-2 md:items-center md:p-8 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-hidden rounded-xl border border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <Image
            src={product.imageSrc}
            alt={product.imageAlt}
            width={640}
            height={480}
            unoptimized
            className="aspect-[4/3] h-auto w-full object-contain"
          />
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-neutral-100">
            {product.name}
          </h1>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
            {formattedPrice}
          </p>
          <p className="text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            {product.description}
          </p>
        </div>
      </article>
    </main>
  );
}
