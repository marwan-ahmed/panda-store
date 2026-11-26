import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetails } from "@/components/product-details";
import { getProductById, getProducts } from "@/lib/products";

interface ProductPageProps {
  readonly params: Promise<{ id: string }>;
}

/**
 * Enumerates all 10 valid synthetic product IDs for static prerendering at build time.
 */
export function generateStaticParams(): Array<{ id: string }> {
  return getProducts().map((product) => ({ id: product.id }));
}

/**
 * Generates Arabic page metadata for a valid product or triggers 404 metadata fallback.
 */
export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = getProductById(id);

  if (!product) {
    notFound();
  }

  return {
    title: `${product.name} | باندا ستور`,
    description: product.description,
  };
}

/**
 * Renders the details page for an allow-listed catalog product or invokes notFound().
 */
export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = getProductById(id);

  if (!product) {
    notFound();
  }

  return <ProductDetails product={product} />;
}
