import {
  CATALOG_PRODUCT_COUNT,
  PRODUCTS,
  formatPriceIqd,
  getProductById,
  getProducts,
  isValidProductId,
  validateCatalog,
  validatePriceIqd,
  validateProduct,
} from "../../../../src/lib/products.ts";

function expectThrows(label, fn) {
  try {
    const res = fn();
    console.error("FAIL (expected throw):", label, "got:", res);
    return false;
  } catch (e) {
    console.log("OK (threw):", label, "->", e.constructor.name + ":", e.message);
    return true;
  }
}

console.log("Node version:", process.version);
console.log("CATALOG_PRODUCT_COUNT:", CATALOG_PRODUCT_COUNT);
console.log("PRODUCTS.length:", PRODUCTS.length);
console.log("MAX_SAFE_INTEGER formatted:", formatPriceIqd(Number.MAX_SAFE_INTEGER));
console.log("1 formatted:", formatPriceIqd(1));
console.log("750 formatted:", formatPriceIqd(750));
console.log("25000 formatted:", formatPriceIqd(25000));

// Tricky price inputs
expectThrows("price -0", () => validatePriceIqd(-0));
expectThrows("price Number.MIN_VALUE", () => validatePriceIqd(Number.MIN_VALUE));
expectThrows("price 0.9999999999999999", () => validatePriceIqd(0.9999999999999999));
expectThrows("price 1.0000000000000002", () => validatePriceIqd(1.0000000000000002));
expectThrows("price MAX_SAFE_INTEGER + 1", () => validatePriceIqd(Number.MAX_SAFE_INTEGER + 1));
expectThrows("price BigInt 100n", () => validatePriceIqd(100n));
expectThrows("price new Number(100)", () => validatePriceIqd(new Number(100)));
expectThrows("price {valueOf: ()=>100}", () => validatePriceIqd({ valueOf: () => 100 }));
expectThrows("format -0", () => formatPriceIqd(-0));
expectThrows("format 5e-324", () => formatPriceIqd(Number.MIN_VALUE));

// Tricky product inputs
const validBase = {
  id: "1",
  name: "منتج",
  priceIqd: 1000,
  imageSrc: "/images/products/product-01.svg",
  imageAlt: "صورة",
  description: "وصف",
};
expectThrows("inherited fields via prototype", () => validateProduct(Object.create(validBase)));
expectThrows("sparse array(10)", () => validateCatalog(new Array(10)));
expectThrows("imageSrc protocol-relative", () =>
  validateProduct({ ...validBase, imageSrc: "//evil.example/a.svg" })
);
expectThrows("imageSrc ..svg", () =>
  validateProduct({ ...validBase, imageSrc: "/images/products/..svg" })
);
expectThrows("imageSrc query string", () =>
  validateProduct({ ...validBase, imageSrc: "/images/products/product-01.svg?x=1" })
);
expectThrows("imageSrc hash", () =>
  validateProduct({ ...validBase, imageSrc: "/images/products/product-01.svg#x" })
);

// Duplicate id after trim
const ten = PRODUCTS.map((p) => ({ ...p }));
ten[9] = { ...ten[9], id: " 1 " };
expectThrows("duplicate id after trim", () => validateCatalog(ten));

// Lookup edge cases
for (const badId of [" 3 ", "03", "3\n", "", "   ", "__proto__", "constructor", "toString", null, undefined, 3]) {
  console.log("lookup", JSON.stringify(badId), "=>", getProductById(badId), isValidProductId(badId));
}
