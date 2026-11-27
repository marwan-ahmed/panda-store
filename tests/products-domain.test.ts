import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

async function loadProducts() {
  return vi.importActual<typeof import("@/lib/products")>("@/lib/products");
}

const VALID_SAMPLE_PRODUCT = {
  id: "1",
  name: "كوب باندا خزفي تجريبي",
  priceIqd: 15000,
  imageSrc: "/images/products/product-01.svg",
  imageAlt: "رسم توضيحي لكوب باندا خزفي أبيض وأسود",
  description: "كوب سيراميك تجريبي بنقش باندا لطيف للاستخدام اليومي.",
};

function makeValidCatalog(count = 10) {
  return Array.from({ length: count }, (_, index) => {
    const num = index + 1;
    const padded = String(num).padStart(2, "0");
    return {
      id: String(num),
      name: `منتج باندا تجريبي رقم ${num}`,
      priceIqd: 5000 * num,
      imageSrc: `/images/products/product-${padded}.svg`,
      imageAlt: `صورة توضيحية لمنتج باندا التجريبي رقم ${num}`,
      description: `وصف عربي اصطناعي لمنتج باندا التجريبي رقم ${num}.`,
    };
  });
}

describe("نطاق الكتالوج والمنتجات والتحقق من الأسعار", () => {
  it("AC-2: يفرض الكتالوج وجود 10 منتجات بالضبط بمعرفات فريدة من 1 إلى 10", async () => {
    const { CATALOG_PRODUCT_COUNT, PRODUCTS, getProducts, validateCatalog } =
      await loadProducts();

    expect(CATALOG_PRODUCT_COUNT).toBe(10);
    expect(PRODUCTS).toHaveLength(10);
    expect(Object.isFrozen(PRODUCTS)).toBe(true);
    expect(getProducts()).toBe(PRODUCTS);

    const validated = validateCatalog(PRODUCTS);
    expect(validated).toHaveLength(10);
    expect(validated.map((item) => item.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
  });

  it("EC-1: يرفض validateCatalog المصفوفات بعدد 0 أو 9 أو 11 أو بمعرفات مكررة", async () => {
    const { validateCatalog } = await loadProducts();

    expect(() => validateCatalog([])).toThrow();
    expect(() => validateCatalog(makeValidCatalog(9))).toThrow();
    expect(() => validateCatalog(makeValidCatalog(11))).toThrow();

    const duplicateIds = makeValidCatalog(10);
    duplicateIds[9] = { ...duplicateIds[9], id: "1" };
    expect(() => validateCatalog(duplicateIds)).toThrow();
  });

  it("AC-3: تحتوي المنتجات العشرة على حقول عربية غير فارغة وصور محلية دون بيانات شخصية حقيقية", async () => {
    const { PRODUCTS, validateProduct } = await loadProducts();

    const iraqiPhonePattern = /(?:\+?964|00964|07\d{9}|\b\d{10,11}\b)/;
    const emailPattern = /\S+@\S+\.\S+/;
    const addressHintPattern = /(?:شارع\s+الرشيد|شارع\s+السعدون|المنصور\s+محلة|زقاق\s+\d+\s+دار\s+\d+)/;

    for (const product of PRODUCTS) {
      const checked = validateProduct(product);
      expect(checked.id.trim().length).toBeGreaterThan(0);
      expect(checked.name.trim().length).toBeGreaterThan(0);
      expect(checked.description.trim().length).toBeGreaterThan(0);
      expect(checked.imageAlt.trim().length).toBeGreaterThan(0);
      expect(checked.imageSrc).toMatch(/^\/images\/products\/[a-z0-9-]+\.svg$/);
      expect(Number.isSafeInteger(checked.priceIqd)).toBe(true);
      expect(checked.priceIqd).toBeGreaterThan(0);

      const svgPath = path.join(process.cwd(), "public", checked.imageSrc.replace(/^\//, ""));
      expect(fs.existsSync(svgPath)).toBe(true);

      const combinedText = `${checked.name} ${checked.description} ${checked.imageAlt}`;
      expect(combinedText).not.toMatch(iraqiPhonePattern);
      expect(combinedText).not.toMatch(emailPattern);
      expect(combinedText).not.toMatch(addressHintPattern);
    }
  });

  it("EC-3: يرفض validateProduct الحقول المفقودة أو الفارغة أو مسافات فقط ومسارات الصور غير المحلية", async () => {
    const { validateProduct } = await loadProducts();

    expect(() => validateProduct(null)).toThrow();
    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, id: "" })).toThrow();
    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, id: "   " })).toThrow();
    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, name: "" })).toThrow();
    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, name: "  \t " })).toThrow();
    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, description: "" })).toThrow();
    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, description: "   " })).toThrow();
    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, imageAlt: "" })).toThrow();
    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, imageAlt: "   " })).toThrow();
    expect(() =>
      validateProduct({ ...VALID_SAMPLE_PRODUCT, imageSrc: "https://evil.example/a.svg" })
    ).toThrow();
    expect(() =>
      validateProduct({ ...VALID_SAMPLE_PRODUCT, imageSrc: "http://localhost/a.svg" })
    ).toThrow();
    expect(() =>
      validateProduct({ ...VALID_SAMPLE_PRODUCT, imageSrc: "javascript:alert(1)" })
    ).toThrow();
    expect(() =>
      validateProduct({ ...VALID_SAMPLE_PRODUCT, imageSrc: "../secret.svg" })
    ).toThrow();
    expect(() =>
      validateProduct({ ...VALID_SAMPLE_PRODUCT, imageSrc: "/images/products/photo.png" })
    ).toThrow();
  });

  it("AC-4: يقبل validatePriceIqd و formatPriceIqd الأعداد الصحيحة الموجبة وينسقانها بدقة بالدينار العراقي", async () => {
    const { validatePriceIqd, formatPriceIqd } = await loadProducts();

    expect(validatePriceIqd(25000)).toBe(25000);
    expect(validatePriceIqd(750)).toBe(750);
    expect(validatePriceIqd(1)).toBe(1);

    expect(formatPriceIqd(25000)).toBe("25,000 د.ع");
    expect(formatPriceIqd(750)).toBe("750 د.ع");
    expect(formatPriceIqd(1)).toBe("1 د.ع");
  });

  it("EC-2: يرفض validatePriceIqd و formatPriceIqd القيم الصفرية والسالبة والعشرية وغير المنتهية وغير الآمنة", async () => {
    const { validatePriceIqd, formatPriceIqd } = await loadProducts();
    const callFormatUnknown = formatPriceIqd as (value: unknown) => string;

    const invalidInputs: unknown[] = [
      0,
      -1,
      -5000,
      15000.5,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      "25000",
      null,
      undefined,
    ];

    for (const bad of invalidInputs) {
      expect(() => validatePriceIqd(bad)).toThrow();
      expect(() => callFormatUnknown(bad)).toThrow();
    }
  });

  it("AB-4: يرفض التحقق والتنسيق أي مدخلات مالية غير صحيحة أو سالبة أو عشرية دون تقريب أو تحويل قسري", async () => {
    const { validatePriceIqd, formatPriceIqd } = await loadProducts();
    const callFormatUnknown = formatPriceIqd as (value: unknown) => string;

    for (const bad of [0, -5000, 15000.5, Number.NaN, Number.POSITIVE_INFINITY, "1000", null]) {
      expect(() => validatePriceIqd(bad)).toThrow();
      expect(() => callFormatUnknown(bad)).toThrow();
    }
  });

  it("AB-5: يرفض الكتالوج أي نقص أو زيادة عن 10 عناصر أو تكرار المعرفات أو فراغ الحقول المطلوبة", async () => {
    const { validateCatalog, validateProduct } = await loadProducts();

    expect(() => validateCatalog([])).toThrow();
    expect(() => validateCatalog(makeValidCatalog(9))).toThrow();
    expect(() => validateCatalog(makeValidCatalog(11))).toThrow();

    const duplicated = makeValidCatalog(10);
    duplicated[5] = { ...duplicated[5], id: "2" };
    expect(() => validateCatalog(duplicated)).toThrow();

    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, name: "   " })).toThrow();
    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, description: "" })).toThrow();
    expect(() => validateProduct({ ...VALID_SAMPLE_PRODUCT, imageAlt: " \t" })).toThrow();
  });

  it("EC-5: يعيد getProductById القيمة undefined عند تمرير أسماء خصائص Object.prototype", async () => {
    const { getProductById, isValidProductId } = await loadProducts();

    for (const key of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
      expect(getProductById(key)).toBeUndefined();
      expect(isValidProductId(key)).toBe(false);
    }
  });

  it("AB-6: يحمي البحث بالمعرف من تسرب خصائص prototype عند تمرير __proto__ و constructor و toString", async () => {
    const { getProductById, isValidProductId } = await loadProducts();

    for (const key of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
      expect(() => getProductById(key)).not.toThrow();
      expect(getProductById(key)).toBeUndefined();
      expect(isValidProductId(key)).toBe(false);
    }
  });

  it("AB-9: يسقط validateProduct الحقول الإضافية غير المصرح بها ولا يحوي الكتالوج بيانات شخصية حقيقية", async () => {
    const { PRODUCTS, validateProduct } = await loadProducts();

    const dirtyInput = {
      ...VALID_SAMPLE_PRODUCT,
      adminNote: "internal-secret",
      discountPercent: 50,
      previousPriceIqd: 30000,
    };

    const sanitized = validateProduct(dirtyInput);
    expect(Object.keys(sanitized).sort()).toEqual([
      "description",
      "id",
      "imageAlt",
      "imageSrc",
      "name",
      "priceIqd",
    ]);
    expect("adminNote" in sanitized).toBe(false);
    expect("discountPercent" in sanitized).toBe(false);
    expect("previousPriceIqd" in sanitized).toBe(false);

    for (const product of PRODUCTS) {
      expect(JSON.stringify(product)).not.toMatch(/(?:\+?964|07\d{9}|@)/);
    }
  });
});
