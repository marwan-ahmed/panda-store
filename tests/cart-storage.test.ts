import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadCartStorageModule() {
  return vi.importActual<typeof import("@/lib/cart-storage")>("@/lib/cart-storage");
}

async function loadCartStoreModule() {
  return vi.importActual<typeof import("@/lib/cart-store")>("@/lib/cart-store");
}

async function loadCartModule() {
  return vi.importActual<typeof import("@/lib/cart")>("@/lib/cart");
}

async function loadCartProviderModule() {
  return vi.importActual<typeof import("@/components/cart-provider")>(
    "@/components/cart-provider"
  );
}

describe("التخزين المحلي ومخزن السلة الخارجي والتطهير", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("AC-7: يحفظ المخزن المحلي صيغة panda-store:cart:v1 المسموح بها فقط ويستعيدها عبر التنقل وحدث storage", async () => {
    const {
      CART_STORAGE_KEY,
      CART_STORAGE_VERSION,
      serializeCart,
      readCartItemsFromStorage,
      writeCartItemsToStorage,
    } = await loadCartStorageModule();
    const { getCartSnapshot, subscribeCart } = await loadCartStoreModule();

    expect(CART_STORAGE_KEY).toBe("panda-store:cart:v1");
    expect(CART_STORAGE_VERSION).toBe(1);

    const json = serializeCart([{ productId: "1", quantity: 2 }]);
    expect(JSON.parse(json)).toEqual({
      version: 1,
      items: [{ productId: "1", quantity: 2 }],
    });

    expect(writeCartItemsToStorage([{ productId: "1", quantity: 2 }])).toBe(true);
    const rawStored = window.localStorage.getItem(CART_STORAGE_KEY);
    expect(rawStored).not.toBeNull();
    expect(JSON.parse(rawStored ?? "")).toEqual({
      version: 1,
      items: [{ productId: "1", quantity: 2 }],
    });

    const readBack = readCartItemsFromStorage();
    expect(readBack.available).toBe(true);
    expect(readBack.needsRepair).toBe(false);
    expect(readBack.items).toEqual([{ productId: "1", quantity: 2 }]);

    const snap = getCartSnapshot();
    expect(snap.itemCount).toBe(2);
    expect(snap.cartTotalIqd).toBe(30000);

    const listener = vi.fn();
    const unsubscribe = subscribeCart(listener);
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "2", quantity: 1 }] })
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: CART_STORAGE_KEY,
        storageArea: window.localStorage,
      })
    );
    expect(listener).toHaveBeenCalled();
    expect(getCartSnapshot().items).toEqual([{ productId: "2", quantity: 1 }]);
    unsubscribe();
  });

  it("AC-8: ينظف parseStoredCart البيانات الفاسدة والمختلطة ويدمج المعرفات المكررة حتى 99", async () => {
    const { parseStoredCart } = await loadCartStorageModule();
    const { buildCart, formatCartTotalIqd } = await loadCartModule();

    const malformed = parseStoredCart("{bad json");
    expect(malformed.items).toEqual([]);
    expect(malformed.needsRepair).toBe(true);

    const mixedRaw = JSON.stringify({
      version: 1,
      items: [
        { productId: "1", quantity: 2, priceIqd: 1 },
        { productId: "99", quantity: 1 },
        { productId: "2", quantity: 0 },
        { productId: "3", quantity: 150 },
        { productId: "4", quantity: 1.5 },
        { productId: "__proto__", quantity: 1 },
      ],
    });

    const parsedMixed = parseStoredCart(mixedRaw);
    expect(parsedMixed.needsRepair).toBe(true);
    expect(parsedMixed.items).toEqual([{ productId: "1", quantity: 2 }]);

    const built = buildCart(parsedMixed.items);
    expect(built.itemCount).toBe(2);
    expect(built.cartTotalIqd).toBe(30000);
    expect(formatCartTotalIqd(built.cartTotalIqd)).toBe("30,000 د.ع");

    const duplicated = parseStoredCart(
      JSON.stringify({
        version: 1,
        items: [
          { productId: "1", quantity: 2 },
          { productId: "1", quantity: 3 },
        ],
      })
    );
    expect(duplicated.needsRepair).toBe(true);
    expect(duplicated.items).toEqual([{ productId: "1", quantity: 5 }]);
  });

  it("EC-5: يتعافى التخزين بأمان من النصوص الضخمة والإصدارات المجهولة وأخطاء المتصفح", async () => {
    const {
      MAX_CART_STORAGE_BYTES,
      parseStoredCart,
      readCartItemsFromStorage,
      writeCartItemsToStorage,
    } = await loadCartStorageModule();

    expect(MAX_CART_STORAGE_BYTES).toBe(65536);

    for (const invalidPayload of [
      "null",
      "123",
      '"text"',
      "{bad",
      JSON.stringify({ version: 99, items: [{ productId: "1", quantity: 2 }] }),
      JSON.stringify({ version: "1", items: [{ productId: "1", quantity: 2 }] }),
    ]) {
      const parsed = parseStoredCart(invalidPayload);
      expect(parsed.items).toEqual([]);
      expect(parsed.needsRepair).toBe(true);
    }

    const oversized = "x".repeat(MAX_CART_STORAGE_BYTES + 100);
    const parsedOversized = parseStoredCart(oversized);
    expect(parsedOversized.items).toEqual([]);
    expect(parsedOversized.needsRepair).toBe(true);

    const throwingStorage: Storage = {
      length: 0,
      clear: () => {},
      key: () => null,
      removeItem: () => {},
      getItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
    };

    const readBlocked = readCartItemsFromStorage(throwingStorage);
    expect(readBlocked.available).toBe(false);
    expect(readBlocked.items).toEqual([]);

    expect(writeCartItemsToStorage([{ productId: "1", quantity: 1 }], throwingStorage)).toBe(
      false
    );
  });

  it("AB-2: يجرد parseStoredCart و repairStoredCartIfNeeded حقول المصادقة والجلسات المزروعة في localStorage", async () => {
    const { CART_STORAGE_KEY, parseStoredCart } = await loadCartStorageModule();
    const { repairStoredCartIfNeeded } = await loadCartStoreModule();

    const dirtyWithAuth = JSON.stringify({
      version: 1,
      items: [{ productId: "1", quantity: 1 }],
      token: "fake-jwt",
      sessionId: "abc",
      password: "123",
    });

    const parsed = parseStoredCart(dirtyWithAuth);
    expect(parsed.needsRepair).toBe(true);
    expect(parsed.items).toEqual([{ productId: "1", quantity: 1 }]);

    window.localStorage.setItem(CART_STORAGE_KEY, dirtyWithAuth);
    repairStoredCartIfNeeded();

    const repairedRaw = window.localStorage.getItem(CART_STORAGE_KEY);
    expect(repairedRaw).not.toBeNull();
    expect(repairedRaw).not.toContain("fake-jwt");
    expect(repairedRaw).not.toContain("sessionId");
    expect(repairedRaw).not.toContain("password");
    expect(JSON.parse(repairedRaw ?? "")).toEqual({
      version: 1,
      items: [{ productId: "1", quantity: 1 }],
    });
  });

  it("AB-3: يزيل التخزين الأسعار والأسماء والصور المزورة ويصلح localStorage عبر CartProvider", async () => {
    const { CART_STORAGE_KEY, parseStoredCart } = await loadCartStorageModule();
    const { getCartSnapshot } = await loadCartStoreModule();
    const { CartProvider } = await loadCartProviderModule();

    const tampered = JSON.stringify({
      version: 1,
      items: [
        {
          productId: "1",
          quantity: 2,
          priceIqd: 1,
          name: "سعر مخفض مزيف",
          imageSrc: "https://evil.example/x.svg",
          lineSubtotalIqd: 2,
        },
      ],
      cartTotalIqd: 2,
    });

    const parsed = parseStoredCart(tampered);
    expect(parsed.needsRepair).toBe(true);
    expect(parsed.items).toEqual([{ productId: "1", quantity: 2 }]);

    window.localStorage.setItem(CART_STORAGE_KEY, tampered);
    render(createElement(CartProvider, null, createElement("div", null, "محتوى")));

    const snap = getCartSnapshot();
    expect(snap.lines[0].product.priceIqd).toBe(15000);
    expect(snap.lines[0].lineSubtotalIqd).toBe(30000);
    expect(snap.cartTotalIqd).toBe(30000);

    const cleaned = window.localStorage.getItem(CART_STORAGE_KEY);
    expect(JSON.parse(cleaned ?? "")).toEqual({
      version: 1,
      items: [{ productId: "1", quantity: 2 }],
    });
  });

  it("AB-4: يدمج parseStoredCart التكرار المتجاوز للحد ويقيده عند 99 مع تفعيل needsRepair", async () => {
    const { parseStoredCart } = await loadCartStorageModule();

    const splitOverflow = JSON.stringify({
      version: 1,
      items: [
        { productId: "1", quantity: 60 },
        { productId: "1", quantity: 50 },
      ],
    });

    const parsed = parseStoredCart(splitOverflow);
    expect(parsed.needsRepair).toBe(true);
    expect(parsed.items).toEqual([{ productId: "1", quantity: 99 }]);
  });

  it("AB-7: يصد parseStoredCart مفاتيح __proto__ المضمنة في JSON دون تلويث Object.prototype", async () => {
    const { parseStoredCart } = await loadCartStorageModule();

    const protoPayload =
      '{"version":1,"items":[{"productId":"1","quantity":2,"__proto__":{"polluted":true}}],"__proto__":{"rootPolluted":true}}';

    const parsed = parseStoredCart(protoPayload);
    expect(parsed.items).toEqual([{ productId: "1", quantity: 2 }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).rootPolluted).toBeUndefined();
  });

  it("AB-8: يسقط parseStoredCart حمولات XSS في المعرفات والحقول الإضافية", async () => {
    const { parseStoredCart } = await loadCartStorageModule();

    const xssRaw = JSON.stringify({
      version: 1,
      items: [
        {
          productId: "1",
          quantity: 1,
          name: "<script>alert(1)</script>",
          imageSrc: "javascript:alert(1)",
        },
        {
          productId: "<img src=x onerror=alert(1)>",
          quantity: 1,
        },
      ],
    });

    const parsed = parseStoredCart(xssRaw);
    expect(parsed.needsRepair).toBe(true);
    expect(parsed.items).toEqual([{ productId: "1", quantity: 1 }]);
    expect(JSON.stringify(parsed.items)).not.toContain("<script>");
    expect(JSON.stringify(parsed.items)).not.toContain("javascript:");
  });

  it("AB-9: تكتب serializeCart حقولاً مسموحاً بها فقط وتمنع تخزين الأسماء والأسعار والبيانات الشخصية", async () => {
    const { serializeCart } = await loadCartStorageModule();

    const serialized = serializeCart([{ productId: "1", quantity: 2 }]);
    expect(serialized).toBe('{"version":1,"items":[{"productId":"1","quantity":2}]}');
    expect(serialized).not.toMatch(/priceIqd|name|description|phone|address|customer/i);
  });

  it("AB-10: يتعامل التخزين والمخزن مع JSON المعطوب و SecurityError و QuotaExceededError دون انهيار", async () => {
    const { CART_STORAGE_KEY, parseStoredCart, writeCartItemsToStorage } =
      await loadCartStorageModule();
    const { getCartSnapshot } = await loadCartStoreModule();

    window.localStorage.setItem(CART_STORAGE_KEY, "{bad");
    expect(() => getCartSnapshot()).not.toThrow();
    expect(getCartSnapshot().itemCount).toBe(0);
    expect(getCartSnapshot().cartTotalIqd).toBe(0);

    expect(parseStoredCart(JSON.stringify({ version: 99, items: [{ productId: "1", quantity: 2 }] }))).toEqual({
      items: [],
      needsRepair: true,
    });

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Security denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() => getCartSnapshot()).not.toThrow();
    expect(writeCartItemsToStorage([{ productId: "1", quantity: 1 }])).toBe(false);
  });

  it("AB-11: يحد parseStoredCart حجم النص وعدد العناصر عند 200 ولا يتجمد عند الحمولات الكبيرة وطفرات التعديل", async () => {
    const { MAX_CART_STORAGE_BYTES, MAX_RAW_STORAGE_ITEMS, parseStoredCart } =
      await loadCartStorageModule();
    const { addToCart, incrementCartItem, updateCartQuantity } = await loadCartModule();

    expect(MAX_RAW_STORAGE_ITEMS).toBe(200);

    const hugeString = `{"version":1,"items":[{"productId":"1","quantity":1}],"pad":"${"a".repeat(
      MAX_CART_STORAGE_BYTES + 1000
    )}"}`;
    const startHuge = Date.now();
    const hugeRes = parseStoredCart(hugeString);
    expect(Date.now() - startHuge).toBeLessThan(1000);
    expect(hugeRes.items).toEqual([]);
    expect(hugeRes.needsRepair).toBe(true);

    const manyEntries = Array.from({ length: 5000 }, (_, i) => ({
      productId: i === 0 ? "1" : "999",
      quantity: 1,
    }));
    const manyJson = JSON.stringify({ version: 1, items: manyEntries });
    if (manyJson.length <= MAX_CART_STORAGE_BYTES) {
      const startMany = Date.now();
      const manyRes = parseStoredCart(manyJson);
      expect(Date.now() - startMany).toBeLessThan(1000);
      expect(manyRes.needsRepair).toBe(true);
      expect(manyRes.items).toEqual([{ productId: "1", quantity: 1 }]);
    } else {
      const cappedEntries = Array.from({ length: 300 }, (_, i) => ({
        productId: i === 250 ? "2" : i === 0 ? "1" : "99",
        quantity: 1,
      }));
      const cappedRes = parseStoredCart(JSON.stringify({ version: 1, items: cappedEntries }));
      expect(cappedRes.needsRepair).toBe(true);
      expect(cappedRes.items).toEqual([{ productId: "1", quantity: 1 }]);
    }

    let currentItems: readonly { productId: string; quantity: number }[] = [];
    for (let i = 0; i < 50; i += 1) {
      const id = String((i % 10) + 1);
      const added = addToCart(currentItems, id);
      if (added.ok) {
        currentItems = added.cart.items;
      }
      const inc = incrementCartItem(currentItems, id);
      if (inc.ok) {
        currentItems = inc.cart.items;
      }
    }
    const upd = updateCartQuantity(currentItems, "1", 99);
    expect(upd.ok).toBe(true);
    if (upd.ok) {
      expect(upd.cart.lines.length).toBeLessThanOrEqual(10);
      for (const line of upd.cart.lines) {
        expect(line.quantity).toBeGreaterThanOrEqual(1);
        expect(line.quantity).toBeLessThanOrEqual(99);
      }
    }
  });

  it("EC-6: يعيد getServerCartSnapshot سلة فارغة دائماً ويثبت مرجع getCartSnapshot عند عدم التغير", async () => {
    const { CART_STORAGE_KEY } = await loadCartStorageModule();
    const { getServerCartSnapshot, getCartSnapshot } = await loadCartStoreModule();

    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "1", quantity: 2 }] })
    );

    const serverSnap1 = getServerCartSnapshot();
    const serverSnap2 = getServerCartSnapshot();
    expect(serverSnap1).toBe(serverSnap2);
    expect(serverSnap1.itemCount).toBe(0);
    expect(serverSnap1.cartTotalIqd).toBe(0);

    const clientSnap1 = getCartSnapshot();
    const clientSnap2 = getCartSnapshot();
    expect(clientSnap1).toBe(clientSnap2);
    expect(clientSnap1.itemCount).toBe(2);
    expect(clientSnap1.cartTotalIqd).toBe(30000);
  });
});
