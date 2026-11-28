import { describe, expect, it, vi } from "vitest";

async function loadCartModule() {
  return vi.importActual<typeof import("@/lib/cart")>("@/lib/cart");
}

async function loadProductsModule() {
  return vi.importActual<typeof import("@/lib/products")>("@/lib/products");
}

describe("نطاق سلة التسوق والتحقق من الكميات والمجاميع", () => {
  it("AC-2: تضيف addToCart المنتج الأول إلى سلة فارغة وتدمج الإضافة الثانية في سطر واحد بحساب صحيح", async () => {
    const { EMPTY_CART, addToCart, formatCartTotalIqd } = await loadCartModule();

    expect(EMPTY_CART.items).toEqual([]);
    expect(EMPTY_CART.lines).toEqual([]);
    expect(EMPTY_CART.itemCount).toBe(0);
    expect(EMPTY_CART.cartTotalIqd).toBe(0);
    expect(Object.isFrozen(EMPTY_CART)).toBe(true);

    const first = addToCart([], "1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(first.cart.items).toEqual([{ productId: "1", quantity: 1 }]);
    expect(first.cart.lines).toHaveLength(1);
    expect(first.cart.lines[0].product.id).toBe("1");
    expect(first.cart.lines[0].product.name).toBe("كوب باندا خزفي");
    expect(first.cart.lines[0].quantity).toBe(1);
    expect(first.cart.lines[0].lineSubtotalIqd).toBe(15000);
    expect(formatCartTotalIqd(first.cart.lines[0].lineSubtotalIqd)).toBe("15,000 د.ع");
    expect(first.cart.itemCount).toBe(1);
    expect(first.cart.cartTotalIqd).toBe(15000);
    expect(formatCartTotalIqd(first.cart.cartTotalIqd)).toBe("15,000 د.ع");

    const second = addToCart(first.cart.items, "1");
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.cart.items).toEqual([{ productId: "1", quantity: 2 }]);
    expect(second.cart.lines).toHaveLength(1);
    expect(second.cart.lines[0].quantity).toBe(2);
    expect(second.cart.lines[0].lineSubtotalIqd).toBe(30000);
    expect(formatCartTotalIqd(second.cart.lines[0].lineSubtotalIqd)).toBe("30,000 د.ع");
    expect(second.cart.itemCount).toBe(2);
    expect(second.cart.cartTotalIqd).toBe(30000);
    expect(formatCartTotalIqd(second.cart.cartTotalIqd)).toBe("30,000 د.ع");
  });

  it("AC-3: تقبل updateCartQuantity الحد الأقصى 99 وترفض الزيادة إلى 100 والمدخلات غير الصالحة دون إتلاف الكمية", async () => {
    const {
      MIN_CART_QUANTITY,
      MAX_CART_QUANTITY,
      addToCart,
      incrementCartItem,
      updateCartQuantity,
      formatCartTotalIqd,
    } = await loadCartModule();

    expect(MIN_CART_QUANTITY).toBe(1);
    expect(MAX_CART_QUANTITY).toBe(99);

    const maxUpdated = updateCartQuantity([{ productId: "1", quantity: 2 }], "1", 99);
    expect(maxUpdated.ok).toBe(true);
    if (!maxUpdated.ok) return;

    expect(maxUpdated.cart.lines[0].quantity).toBe(99);
    expect(maxUpdated.cart.lines[0].lineSubtotalIqd).toBe(1485000);
    expect(formatCartTotalIqd(maxUpdated.cart.lines[0].lineSubtotalIqd)).toBe("1,485,000 د.ع");
    expect(maxUpdated.cart.itemCount).toBe(99);
    expect(maxUpdated.cart.cartTotalIqd).toBe(1485000);

    const addOverflow = addToCart(maxUpdated.cart.items, "1");
    expect(addOverflow.ok).toBe(false);
    if (!addOverflow.ok) {
      expect(addOverflow.reason).toBe("max_quantity_reached");
      expect(addOverflow.message).toMatch(/99/);
      expect(addOverflow.message).toMatch(/[\u0600-\u06FF]/);
      expect(addOverflow.cart.lines[0].quantity).toBe(99);
      expect(addOverflow.cart.cartTotalIqd).toBe(1485000);
    }

    const incOverflow = incrementCartItem(maxUpdated.cart.items, "1");
    expect(incOverflow.ok).toBe(false);
    if (!incOverflow.ok) {
      expect(incOverflow.reason).toBe("max_quantity_reached");
      expect(incOverflow.message).toMatch(/99/);
      expect(incOverflow.cart.lines[0].quantity).toBe(99);
    }

    const baseItems = [{ productId: "1", quantity: 2 }];
    for (const invalidQty of [0, -3, 1.5, "abc", ""]) {
      const rejected = updateCartQuantity(baseItems, "1", invalidQty);
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) {
        expect(rejected.message).toMatch(/[\u0600-\u06FF]/);
        expect(rejected.cart.lines[0].quantity).toBe(2);
        expect(rejected.cart.cartTotalIqd).toBe(30000);
      }
    }
  });

  it("EC-2: تقبل validateCartQuantity و parseQuantityInput الحدين 1 و 99 وترفض الكسور والسلاسل المخادعة دون تقريب", async () => {
    const { validateCartQuantity, parseQuantityInput } = await loadCartModule();

    expect(validateCartQuantity(1)).toBe(1);
    expect(validateCartQuantity(99)).toBe(99);

    for (const validStr of ["1", " 1 ", "2", "99", "09"]) {
      const parsed = parseQuantityInput(validStr);
      expect(parsed.ok).toBe(true);
    }

    const invalidNumericValues: unknown[] = [
      0,
      -0,
      -1,
      -3,
      1.5,
      0.5,
      100,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      "1",
      null,
      undefined,
      {},
    ];
    for (const bad of invalidNumericValues) {
      expect(() => validateCartQuantity(bad)).toThrow();
    }

    const invalidStrings = [
      "0",
      "-1",
      "-3",
      "1.5",
      "0.5",
      "1abc",
      "1e2",
      "+1",
      "0x10",
      "",
      "   ",
    ];
    for (const badStr of invalidStrings) {
      const parsed = parseQuantityInput(badStr);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.reason).toBe("invalid_quantity");
        expect(parsed.message).toMatch(/[\u0600-\u06FF]/);
      }
    }

    for (const overStr of ["100", "99999999999999999999"]) {
      const parsed = parseQuantityInput(overStr);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.reason).toBe("max_quantity_reached");
        expect(parsed.message).toMatch(/99/);
      }
    }
  });

  it("AB-5: تصد دوال الكمية محاولات تجاوز الحدود أو التحويل القسري وتحافظ على الكمية السابقة", async () => {
    const { updateCartQuantity, decrementCartItem, parseQuantityInput } = await loadCartModule();

    const base = [{ productId: "1", quantity: 2 }];
    const hostileValues: unknown[] = [
      0,
      -0,
      -1,
      -3,
      1.5,
      0.5,
      "1abc",
      "1e2",
      "+1",
      "0x10",
      "",
      "   ",
      100,
      "99999999999999999999",
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      null,
      {},
    ];

    for (const bad of hostileValues) {
      const res = updateCartQuantity(base, "1", bad);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.cart.lines[0].quantity).toBe(2);
        expect(res.cart.cartTotalIqd).toBe(30000);
      }
    }

    const callParseUnknown = parseQuantityInput as (value: unknown) => { ok: boolean };
    expect(callParseUnknown(null).ok).toBe(false);

    const minRes = decrementCartItem([{ productId: "1", quantity: 1 }], "1");
    expect(minRes.ok).toBe(false);
    if (!minRes.ok) {
      expect(minRes.reason).toBe("min_quantity_reached");
      expect(minRes.cart.lines).toHaveLength(1);
      expect(minRes.cart.lines[0].quantity).toBe(1);
    }
  });

  it("AC-4: تحافظ decrementCartItem على الحد الأدنى 1 وتحذف removeFromCart بنداً واحداً وتفرغ clearCart السلة", async () => {
    const { decrementCartItem, removeFromCart, clearCart, formatCartTotalIqd } =
      await loadCartModule();

    const atMin = decrementCartItem([{ productId: "1", quantity: 1 }], "1");
    expect(atMin.ok).toBe(false);
    if (!atMin.ok) {
      expect(atMin.reason).toBe("min_quantity_reached");
      expect(atMin.cart.lines).toHaveLength(1);
      expect(atMin.cart.lines[0].quantity).toBe(1);
      expect(atMin.message).toMatch(/[\u0600-\u06FF]/);
    }

    const decremented = decrementCartItem([{ productId: "1", quantity: 3 }], "1");
    expect(decremented.ok).toBe(true);
    if (decremented.ok) {
      expect(decremented.cart.lines[0].quantity).toBe(2);
      expect(decremented.cart.cartTotalIqd).toBe(30000);
    }

    const twoItems = [
      { productId: "2", quantity: 2 },
      { productId: "9", quantity: 3 },
    ];
    const removed = removeFromCart(twoItems, "2");
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;

    expect(removed.cart.items).toEqual([{ productId: "9", quantity: 3 }]);
    expect(removed.cart.lines).toHaveLength(1);
    expect(removed.cart.itemCount).toBe(3);
    expect(removed.cart.cartTotalIqd).toBe(22500);
    expect(formatCartTotalIqd(removed.cart.cartTotalIqd)).toBe("22,500 د.ع");

    const cleared = clearCart();
    expect(cleared.items).toEqual([]);
    expect(cleared.lines).toEqual([]);
    expect(cleared.itemCount).toBe(0);
    expect(cleared.cartTotalIqd).toBe(0);
    expect(formatCartTotalIqd(cleared.cartTotalIqd)).toBe("0 د.ع");
  });

  it("EC-3: تحافظ decrementCartItem على السطر عند الكمية 1 وينقل حذف آخر عنصر إلى 0 د.ع", async () => {
    const { decrementCartItem, removeFromCart, formatCartTotalIqd } = await loadCartModule();

    const minAttempt = decrementCartItem([{ productId: "2", quantity: 1 }], "2");
    expect(minAttempt.ok).toBe(false);
    if (!minAttempt.ok) {
      expect(minAttempt.reason).toBe("min_quantity_reached");
      expect(minAttempt.cart.items).toEqual([{ productId: "2", quantity: 1 }]);
    }

    const removeLast = removeFromCart([{ productId: "2", quantity: 1 }], "2");
    expect(removeLast.ok).toBe(true);
    if (removeLast.ok) {
      expect(removeLast.cart.itemCount).toBe(0);
      expect(removeLast.cart.cartTotalIqd).toBe(0);
      expect(formatCartTotalIqd(removeLast.cart.cartTotalIqd)).toBe("0 د.ع");
    }
  });

  it("AC-5: تحسب buildCart مجاميع الأسطر والإجمالي بدقة عددية صحيحة حتى الحد الأقصى 19,899,000 د.ع", async () => {
    const { buildCart, formatCartTotalIqd } = await loadCartModule();
    const { PRODUCTS, formatPriceIqd } = await loadProductsModule();

    const sampleCart = buildCart([
      { productId: "2", quantity: 2 },
      { productId: "9", quantity: 3 },
    ]);

    expect(sampleCart.lines[0].lineSubtotalIqd).toBe(19000);
    expect(formatCartTotalIqd(sampleCart.lines[0].lineSubtotalIqd)).toBe("19,000 د.ع");
    expect(sampleCart.lines[1].lineSubtotalIqd).toBe(22500);
    expect(formatCartTotalIqd(sampleCart.lines[1].lineSubtotalIqd)).toBe("22,500 د.ع");
    expect(sampleCart.itemCount).toBe(5);
    expect(sampleCart.cartTotalIqd).toBe(41500);
    expect(formatCartTotalIqd(sampleCart.cartTotalIqd)).toBe("41,500 د.ع");

    const maxItems = PRODUCTS.map((product) => ({ productId: product.id, quantity: 99 }));
    const maxCart = buildCart(maxItems);
    expect(maxCart.itemCount).toBe(990);
    expect(maxCart.cartTotalIqd).toBe(19899000);
    expect(Number.isSafeInteger(maxCart.cartTotalIqd)).toBe(true);
    expect(formatCartTotalIqd(maxCart.cartTotalIqd)).toBe("19,899,000 د.ع");

    expect(formatCartTotalIqd(0)).toBe("0 د.ع");
    expect(() => formatPriceIqd(0)).toThrow();
  });

  it("EC-4: تقبل formatCartTotalIqd القيم الصحيحة غير السالبة وترفض السالب والكسور بينما يرفض formatPriceIqd الصفر", async () => {
    const { formatCartTotalIqd } = await loadCartModule();
    const { formatPriceIqd, validatePriceIqd } = await loadProductsModule();

    expect(formatCartTotalIqd(0)).toBe("0 د.ع");
    expect(formatCartTotalIqd(750)).toBe("750 د.ع");
    expect(formatCartTotalIqd(41500)).toBe("41,500 د.ع");
    expect(formatCartTotalIqd(1485000)).toBe("1,485,000 د.ع");
    expect(formatCartTotalIqd(19899000)).toBe("19,899,000 د.ع");

    const callFormatUnknown = formatCartTotalIqd as (value: unknown) => string;
    for (const bad of [
      -1,
      15000.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      "0",
      null,
    ]) {
      expect(() => callFormatUnknown(bad)).toThrow();
    }

    expect(() => formatPriceIqd(0)).toThrow();
    expect(() => validatePriceIqd(0)).toThrow();
  });

  it("AB-6: تحمي حسابات المجاميع من الأعداد غير الآمنة والتنسيق غير الصحيح دون إضعاف formatPriceIqd", async () => {
    const { buildCart, formatCartTotalIqd } = await loadCartModule();
    const { PRODUCTS, formatPriceIqd, validatePriceIqd } = await loadProductsModule();

    const maxCart = buildCart(PRODUCTS.map((p) => ({ productId: p.id, quantity: 99 })));
    expect(maxCart.itemCount).toBe(990);
    expect(maxCart.cartTotalIqd).toBe(19899000);
    expect(formatCartTotalIqd(maxCart.cartTotalIqd)).toBe("19,899,000 د.ع");

    const callFormatUnknown = formatCartTotalIqd as (value: unknown) => string;
    for (const bad of [-1, 15000.5, Number.NaN, Number.POSITIVE_INFINITY, "0", null]) {
      expect(() => callFormatUnknown(bad)).toThrow();
    }

    expect(() => validatePriceIqd(0)).toThrow();
    expect(() => formatPriceIqd(0)).toThrow();
  });

  it("EC-1: ترفض عمليات السلة المعرفات الفارغة وغير المدرجة ومفاتيح Object.prototype", async () => {
    const {
      addToCart,
      updateCartQuantity,
      incrementCartItem,
      decrementCartItem,
      removeFromCart,
      sanitizeCartItems,
    } = await loadCartModule();

    const badIds = [
      "",
      "   ",
      " 1 ",
      "99",
      "0",
      "-1",
      "__proto__",
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
    ];

    for (const badId of badIds) {
      const addRes = addToCart([], badId);
      expect(addRes.ok).toBe(false);
      if (!addRes.ok) {
        expect(addRes.reason).toBe("invalid_product");
      }

      const updRes = updateCartQuantity([{ productId: "1", quantity: 2 }], badId, 3);
      expect(updRes.ok).toBe(false);
      if (!updRes.ok) {
        expect(updRes.reason).toBe("invalid_product");
      }

      const incRes = incrementCartItem([{ productId: "1", quantity: 2 }], badId);
      expect(incRes.ok).toBe(false);

      const decRes = decrementCartItem([{ productId: "1", quantity: 2 }], badId);
      expect(decRes.ok).toBe(false);

      const remRes = removeFromCart([{ productId: "1", quantity: 2 }], badId);
      expect(remRes.ok).toBe(false);

      expect(sanitizeCartItems([{ productId: badId, quantity: 2 }])).toEqual([]);
    }
  });

  it("AB-7: تمنع دوال السلة تلوث prototype والخصائص الموروثة عند تمرير كائنات ومفاتيح خبيثة", async () => {
    const { sanitizeCartItems, addToCart } = await loadCartModule();

    const inheritedProtoObj = Object.create({ productId: "1", quantity: 5 }) as unknown;
    const sanitized = sanitizeCartItems([
      inheritedProtoObj,
      { productId: "__proto__", quantity: 2 },
      { productId: "constructor", quantity: 1 },
      { productId: "1", quantity: 2 },
    ]);

    expect(sanitized).toEqual([{ productId: "1", quantity: 2 }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(addToCart([], "__proto__").ok).toBe(false);
  });

  it("AB-3: تسقط sanitizeCartItems و buildCart الأسعار والبيانات المزورة وتعتمد أسعار PRODUCTS حصراً", async () => {
    const { sanitizeCartItems, buildCart } = await loadCartModule();

    const dirtyItems: unknown[] = [
      {
        productId: "1",
        quantity: 2,
        priceIqd: 1,
        name: "سعر مخفض مزيف",
        imageSrc: "https://evil.example/x.svg",
        lineSubtotalIqd: 2,
      },
    ];

    const cleanItems = sanitizeCartItems(dirtyItems);
    expect(cleanItems).toEqual([{ productId: "1", quantity: 2 }]);
    expect(Object.keys(cleanItems[0]).sort()).toEqual(["productId", "quantity"]);
    expect("priceIqd" in cleanItems[0]).toBe(false);

    const built = buildCart(cleanItems);
    expect(built.lines[0].product.priceIqd).toBe(15000);
    expect(built.lines[0].product.name).toBe("كوب باندا خزفي");
    expect(built.lines[0].lineSubtotalIqd).toBe(30000);
    expect(built.cartTotalIqd).toBe(30000);
  });

  it("AB-4: تدمج sanitizeCartItems السطور المكررة للمنتج نفسه وتقيد المجموع عند الحد الأقصى 99", async () => {
    const { sanitizeCartItems, buildCart } = await loadCartModule();

    const merged = sanitizeCartItems([
      { productId: "1", quantity: 60 },
      { productId: "1", quantity: 50 },
    ]);

    expect(merged).toEqual([{ productId: "1", quantity: 99 }]);
    const cart = buildCart(merged);
    expect(cart.itemCount).toBe(99);
    expect(cart.cartTotalIqd).toBe(1485000);
  });

  it("AB-9: تخرج sanitizeCartItems كائنات مجمدة تحتوي على productId و quantity فقط دون حقول غير مصرح بها", async () => {
    const { sanitizeCartItems } = await loadCartModule();

    const dirty = [
      {
        productId: "1",
        quantity: 2,
        priceIqd: 1,
        discountPercent: 50,
        role: "admin",
        isAdmin: true,
        customerName: "بيانات تجريبية",
        phone: "07700000000",
        address: "عنوان تجريبي",
      },
    ];

    const sanitized = sanitizeCartItems(dirty);
    expect(sanitized).toHaveLength(1);
    expect(Object.isFrozen(sanitized)).toBe(true);
    expect(Object.isFrozen(sanitized[0])).toBe(true);
    expect(Object.keys(sanitized[0]).sort()).toEqual(["productId", "quantity"]);
  });
});
