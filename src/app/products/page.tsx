import { notFound } from "next/navigation";

/**
 * Rejects bare /products requests without an ID segment by invoking Next.js 404 handling.
 */
export default function ProductsIndexPage(): never {
  notFound();
}
