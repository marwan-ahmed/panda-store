import type { Metadata } from "next";
import { CartView } from "@/components/cart-view";

export const metadata: Metadata = {
  title: "سلة التسوق | باندا ستور",
  description: "عرض وإدارة سلة التسوق في متجر باندا ستور التجريبي.",
};

/**
 * Independent Arabic RTL shopping cart route rendering the client CartView.
 */
export default function CartPage() {
  return <CartView />;
}
