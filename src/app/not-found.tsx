import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";

export const metadata: Metadata = {
  title: "المنتج غير موجود | باندا ستور",
  description: "عذراً، المنتج أو الصفحة المطلوبة غير متوفرة في كتالوج باندا ستور.",
};

/**
 * Root Arabic 404 page rendered for unmatched routes and proxy /__not-found rewrites.
 */
export default function NotFound() {
  return <NotFoundView />;
}
