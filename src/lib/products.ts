export interface Product {
  readonly id: string;
  readonly name: string;
  readonly priceIqd: number;
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly description: string;
}

export const CATALOG_PRODUCT_COUNT = 10;

const LOCAL_PRODUCT_SVG_PATH_PATTERN = /^\/images\/products\/[a-z0-9-]+\.svg$/;
const IQD_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function requireTrimmedString(
  record: Record<string, unknown>,
  field: "id" | "name" | "description" | "imageAlt" | "imageSrc"
): string {
  if (!Object.hasOwn(record, field)) {
    throw new TypeError(`Missing required product field: ${field}`);
  }
  const value = record[field];
  if (typeof value !== "string") {
    throw new TypeError(`Product field "${field}" must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new RangeError(`Product field "${field}" must not be empty`);
  }
  return trimmed;
}

/**
 * Validates that an IQD price is a strictly positive safe integer.
 */
export function validatePriceIqd(price: unknown): number {
  if (typeof price !== "number") {
    throw new TypeError("priceIqd must be a number");
  }
  if (!Number.isSafeInteger(price) || price <= 0) {
    throw new RangeError("priceIqd must be a positive safe integer");
  }
  return price;
}

/**
 * Formats a validated integer IQD price for Arabic storefront display.
 */
export function formatPriceIqd(priceIqd: number): string {
  const validPrice = validatePriceIqd(priceIqd);
  return `${IQD_NUMBER_FORMATTER.format(validPrice)} د.ع`;
}

/**
 * Validates an untrusted product record and returns a frozen allow-listed Product DTO.
 */
export function validateProduct(item: unknown): Product {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    throw new TypeError("Product must be a non-null plain object");
  }

  const record = item as Record<string, unknown>;
  const id = requireTrimmedString(record, "id");
  const name = requireTrimmedString(record, "name");
  const description = requireTrimmedString(record, "description");
  const imageAlt = requireTrimmedString(record, "imageAlt");
  const imageSrc = requireTrimmedString(record, "imageSrc");

  if (!LOCAL_PRODUCT_SVG_PATH_PATTERN.test(imageSrc)) {
    throw new RangeError(
      "imageSrc must match a local /images/products/<name>.svg asset path"
    );
  }

  if (!Object.hasOwn(record, "priceIqd")) {
    throw new TypeError("Missing required product field: priceIqd");
  }
  const priceIqd = validatePriceIqd(record.priceIqd);

  return Object.freeze({
    id,
    name,
    priceIqd,
    imageSrc,
    imageAlt,
    description,
  });
}

/**
 * Validates that a catalog contains exactly 10 valid products with unique IDs.
 */
export function validateCatalog(items: readonly unknown[]): readonly Product[] {
  if (!Array.isArray(items)) {
    throw new TypeError("Catalog items must be an array");
  }
  if (items.length !== CATALOG_PRODUCT_COUNT) {
    throw new RangeError(
      `Catalog must contain exactly ${CATALOG_PRODUCT_COUNT} products`
    );
  }

  const seenIds = new Set<string>();
  const validated: Product[] = [];

  for (const item of items) {
    const product = validateProduct(item);
    if (seenIds.has(product.id)) {
      throw new RangeError(`Duplicate product id in catalog: ${product.id}`);
    }
    seenIds.add(product.id);
    validated.push(product);
  }

  return Object.freeze(validated);
}

export const PRODUCTS: readonly Product[] = validateCatalog([
  {
    id: "1",
    name: "كوب باندا خزفي",
    priceIqd: 15000,
    imageSrc: "/images/products/product-01.svg",
    imageAlt: "رسم توضيحي لكوب باندا خزفي باللونين الأبيض والأسود",
    description:
      "كوب خزفي تجريبي بتصميم وجه باندا لطيف ومقبض مريح للمشروبات الساخنة اليومية.",
  },
  {
    id: "2",
    name: "دفتر ملاحظات باندا",
    priceIqd: 9500,
    imageSrc: "/images/products/product-02.svg",
    imageAlt: "رسم توضيحي لدفتر ملاحظات باندا بغلاف أخضر داكن",
    description:
      "دفتر ملاحظات تجريبي بغلاف أخضر مقوّى ورسوم باندا أنيقة مع شريط تحديد للصفحات.",
  },
  {
    id: "3",
    name: "حقيبة قماشية بطبعة باندا",
    priceIqd: 18000,
    imageSrc: "/images/products/product-03.svg",
    imageAlt: "رسم توضيحي لحقيبة قماشية بطبعة باندا ومقابض خضراء",
    description:
      "حقيبة كتف قماشية تجريبية متينة باللون الكريمي مزينة برسمة باندا لطيفة للاستخدام اليومي.",
  },
  {
    id: "4",
    name: "مصباح مكتب ليلي بشكل باندا",
    priceIqd: 28000,
    imageSrc: "/images/products/product-04.svg",
    imageAlt: "رسم توضيحي لمصباح مكتب ليلي بشكل باندا مضيء",
    description:
      "مصباح مكتب ليلي تجريبي بتصميم باندا يبعث إضاءة دافئة وهادئة لغرف الدراسة والنوم.",
  },
  {
    id: "5",
    name: "وسادة قطنية برسم باندا",
    priceIqd: 22000,
    imageSrc: "/images/products/product-05.svg",
    imageAlt: "رسم توضيحي لوسادة قطنية برسم باندا ووجنتين ورديتين",
    description:
      "وسادة ديكور قطنية ناعمة تجريبية على شكل وجه باندا مريحة للأريكة أو غرفة الجلوس.",
  },
  {
    id: "6",
    name: "مطارة ماء معزولة بنقش باندا",
    priceIqd: 25000,
    imageSrc: "/images/products/product-06.svg",
    imageAlt: "رسم توضيحي لمطارة ماء معزولة بنقش باندا وغطاء أخضر",
    description:
      "مطارة ماء معزولة تجريبية بغطاء محكم وحلقة حمل سهلة مزينة بنقش باندا عصري.",
  },
  {
    id: "7",
    name: "غطاء هاتف سيليكون بنقش باندا",
    priceIqd: 12000,
    imageSrc: "/images/products/product-07.svg",
    imageAlt: "رسم توضيحي لغطاء هاتف سيليكون أبيض بنقش باندا",
    description:
      "غطاء حماية مرن من السيليكون التجريبي للهاتف بتفاصيل وجه باندا بارزة وملمس ناعم.",
  },
  {
    id: "8",
    name: "ساعة حائط بتصميم باندا",
    priceIqd: 34000,
    imageSrc: "/images/products/product-08.svg",
    imageAlt: "رسم توضيحي لساعة حائط دائرية بتصميم باندا",
    description:
      "ساعة حائط صامتة تجريبية بتصميم باندا دائري وعقارب واضحة تناسب غرف المعيشة والمكاتب.",
  },
  {
    id: "9",
    name: "مجموعة أقلام وملصقات باندا",
    priceIqd: 7500,
    imageSrc: "/images/products/product-09.svg",
    imageAlt: "رسم توضيحي لمجموعة أقلام وملصقات باندا مكتبية",
    description:
      "مجموعة قرطاسية تجريبية تضم أقلاماً برؤوس باندا وورقة ملصقات زاهية لتنظيم الدفاتر.",
  },
  {
    id: "10",
    name: "قميص قطني بطبعة باندا",
    priceIqd: 30000,
    imageSrc: "/images/products/product-10.svg",
    imageAlt: "رسم توضيحي لقميص قطني أبيض بطبعة باندا",
    description:
      "قميص قطني مريح تجريبي باللون الأبيض مع طبعة باندا أمامية بسيطة وخياطة متقنة.",
  },
]);

/**
 * Returns the static, immutable catalog of 10 validated products.
 */
export function getProducts(): readonly Product[] {
  return PRODUCTS;
}

/**
 * Looks up a product by exact ID using linear scan so Object.prototype keys never match.
 */
export function getProductById(id: string): Product | undefined {
  if (typeof id !== "string" || id.trim().length === 0) {
    return undefined;
  }
  return PRODUCTS.find((product) => product.id === id);
}

/**
 * Returns true when id matches one of the 10 catalog products.
 */
export function isValidProductId(id: string): boolean {
  return getProductById(id) !== undefined;
}
