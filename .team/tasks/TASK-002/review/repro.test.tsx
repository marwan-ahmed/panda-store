import { act, fireEvent, render } from "@testing-library/react";
import { Activity } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { CartView } from "@/components/cart-view";
import {
  buildCart,
  formatCartTotalIqd,
  sanitizeCartItems,
  type CartItem,
} from "@/lib/cart";
import { CART_STORAGE_KEY } from "@/lib/cart-storage";

describe("TASK-002 adversarial review reproductions", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("REV-01: CartView retains stale alertMessage and draftQuantities across Activity hidden/visible cycle", () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "1", quantity: 2 }] })
    );

    const rendered = render(
      <Activity mode="visible">
        <CartView />
      </Activity>
    );

    const input = rendered.getByLabelText(/كمية/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    expect(rendered.getByRole("alert")).toBeInTheDocument();
    expect(input.value).toBe("abc");

    act(() => {
      rendered.rerender(
        <Activity mode="hidden">
          <CartView />
        </Activity>
      );
    });
    act(() => {
      rendered.rerender(
        <Activity mode="visible">
          <CartView />
        </Activity>
      );
    });

    // Stale alert and unsubmitted invalid draft remain visible after Activity hide/show
    expect(rendered.queryByRole("alert")).not.toBeNull();
    expect((rendered.getByLabelText(/كمية/) as HTMLInputElement).value).toBe("abc");
  });

  it("REV-02: formatCartTotalIqd(-0) formats as '-0 د.ع' instead of '0 د.ع' or throwing", () => {
    expect(formatCartTotalIqd(-0)).toBe("-0 د.ع");
  });

  it("REV-03: sanitizeCartItems reads record.quantity twice, allowing mutating getter TOCTOU to produce negative quantity and total in buildCart", () => {
    let reads = 0;
    const hostileItem = {
      productId: "1",
      get quantity() {
        reads += 1;
        return reads === 1 ? 1 : -50;
      },
    };

    const sanitized = sanitizeCartItems([hostileItem]);
    expect(sanitized).toEqual([{ productId: "1", quantity: -50 }]);

    reads = 0;
    const cart = buildCart([hostileItem as unknown as CartItem]);
    expect(cart.cartTotalIqd).toBe(-750000);
  });
});
