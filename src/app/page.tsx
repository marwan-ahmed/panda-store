import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/products";

/**
 * Renders the Panda Store home page with the 10-product synthetic Arabic catalog.
 */
export default function Home() {
  const products = getProducts();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-neutral-900 sm:text-4xl dark:text-neutral-100">
          باندا ستور
        </h1>
        <p className="mt-2 text-base text-neutral-600 dark:text-neutral-300">
          كتالوج المنتجات التجريبي
        </p>
      </header>

      <section
        aria-label="كتالوج المنتجات"
        className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
    </main>
  );
}
