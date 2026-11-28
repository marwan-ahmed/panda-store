"use client";

import { useEffect, type ReactNode } from "react";
import { repairStoredCartIfNeeded } from "@/lib/cart-store";

export interface CartProviderProps {
  readonly children: ReactNode;
}

/**
 * Mount-time boundary that normalizes tampered or corrupted browser cart payloads
 * without triggering React setState inside effects.
 */
export function CartProvider({ children }: CartProviderProps) {
  useEffect(() => {
    repairStoredCartIfNeeded();
  }, []);

  return <>{children}</>;
}
