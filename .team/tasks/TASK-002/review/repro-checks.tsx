import { act, fireEvent, render } from "@testing-library/react";
import { Activity, StrictMode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { CartView } from "@/components/cart-view";
import {
  buildCart,
  formatCartTotalIqd,
  sanitizeCartItems,
  type CartItem,
} from "@/lib/cart";
import { CART_STORAGE_KEY } from "@/lib/cart-storage";

describe("TASK-002 adversarial re-review verification", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("REV-01-FIX: CartView clears alertMessage and draftQuantities on Activity hidden/visible cycle (invalid input & max-99 alert)", () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "1", quantity: 2 }] })
    );

    const rendered = render(
      <StrictMode>
        <Activity mode="visible">
          <CartView />
        </Activity>
      </StrictMode>
    );

    const input = rendered.getByLabelText(/كمية/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    expect(rendered.getByRole("alert")).toBeInTheDocument();
    expect(input.value).toBe("abc");

    act(() => {
      rendered.rerender(
        <StrictMode>
          <Activity mode="hidden">
            <CartView />
          </Activity>
        </StrictMode>
      );
    });
    act(() => {
      rendered.rerender(
        <StrictMode>
          <Activity mode="visible">
            <CartView />
          </Activity>
        </StrictMode>
      );
    });

    expect(rendered.queryByRole("alert")).toBeNull();
    expect((rendered.getByLabelText(/كمية/) as HTMLInputElement).value).toBe("2");

    // Second cycle: max_quantity_reached alert at 99 via '+' button
    fireEvent.change(rendered.getByLabelText(/كمية/), { target: { value: "99" } });
    fireEvent.click(rendered.getByRole("button", { name: /\+|زيادة/ }));
    expect(rendered.getByRole("alert").textContent).toMatch(/99/);

    act(() => {
      rendered.rerender(
        <StrictMode>
          <Activity mode="hidden">
            <CartView />
          </Activity>
        </StrictMode>
      );
    });
    act(() => {
      rendered.rerender(
        <StrictMode>
          <Activity mode="visible">
            <CartView />
          </Activity>
        </StrictMode>
      );
    });

    expect(rendered.queryByRole("alert")).toBeNull();
    expect((rendered.getByLabelText(/كمية/) as HTMLInputElement).value).toBe("99");
  });

  it("REV-02: formatCartTotalIqd(-0) still formats as '-0 د.ع'", () => {
    expect(formatCartTotalIqd(-0)).toBe("-0 د.ع");
  });

  it("REV-03: sanitizeCartItems still reads record.quantity twice, allowing mutating getter TOCTOU", () => {
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
