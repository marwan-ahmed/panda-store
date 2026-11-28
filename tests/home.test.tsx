import { render, screen, within } from "@testing-library/react";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { metadata as rootMetadata } from "@/app/layout";
import Home from "@/app/page";

async function loadProductsModule() {
  return vi.importActual<typeof import("@/lib/products")>("@/lib/products");
}

async function loadProductCardModule() {
  return vi.importActual<typeof import("@/components/product-card")>(
    "@/components/product-card"
  );
}

async function loadProductDetailsModule() {
  return vi.importActual<typeof import("@/components/product-details")>(
    "@/components/product-details"
  );
}

async function loadNotFoundViewModule() {
  return vi.importActual<typeof import("@/components/not-found-view")>(
    "@/components/not-found-view"
  );
}

describe("الصفحة الرئيسية والكتالوج", () => {
  it("AC-1: تعرض الصفحة الرئيسية عنوان باندا ستور والكتالوج المكون من 10 منتجات دون عبارة قيد البناء مع جذر عربي RTL", () => {
    const layoutElement = RootLayout({
      children: <div>محتوى</div>,
    } as Parameters<typeof RootLayout>[0]);
    expect(isValidElement(layoutElement)).toBe(true);
    const htmlEl = layoutElement as ReactElement<{ lang?: string; dir?: string }>;
    expect(htmlEl.type).toBe("html");
    expect(htmlEl.props.lang).toBe("ar");
    expect(htmlEl.props.dir).toBe("rtl");

    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "باندا ستور" })).toBeInTheDocument();
    expect(screen.queryByText(/المتجر قيد البناء/)).not.toBeInTheDocument();

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(10);
  });

  it("AC-5: تعرض كل بطاقة منتج الاسم والسعر الواحد الثابت والصورة المحلية والوصف ورابط التفاصيل دون خصومات أو رسوم", async () => {
    const { getProducts, formatPriceIqd } = await loadProductsModule();
    const { ProductCard } = await loadProductCardModule();

    const products = getProducts();
    expect(products).toHaveLength(10);

    const { container, unmount } = render(<Home />);
    const cards = within(container).getAllByRole("article");
    expect(cards).toHaveLength(10);

    for (const [index, product] of products.entries()) {
      const card = cards[index];
      const formattedPrice = formatPriceIqd(product.priceIqd);

      expect(within(card).getByText(product.name)).toBeInTheDocument();
      expect(within(card).getByText(formattedPrice)).toBeInTheDocument();
      expect(within(card).getByText(product.description)).toBeInTheDocument();

      const img = within(card).getByRole("img", { name: product.imageAlt });
      expect(img.getAttribute("src")).toContain(product.imageSrc);
      expect(img.getAttribute("src")).toMatch(/^\/images\/products\/[a-z0-9-]+\.svg/);

      const detailLink = within(card).getByRole("link");
      expect(detailLink).toHaveAttribute("href", `/products/${product.id}`);

      expect(card.querySelector("del, s")).toBeNull();
      const text = card.textContent ?? "";
      expect(text).not.toMatch(/خصم|تخفيض|السعر السابق|بدلاً من|ضريبة|توصيل|شحن|%/);
    }

    unmount();
    const single = render(<ProductCard product={products[0]} />);
    expect(single.container.textContent).toContain(formatPriceIqd(products[0].priceIqd));
    expect(single.container.querySelector("del, s")).toBeNull();
  });

  it("AC-8: تخلو جميع واجهات المتجر من أزرار الشراء الفوري وإتمام الطلب والدفع وتسجيل الدخول والبحث والتصفية", async () => {
    const { getProducts } = await loadProductsModule();
    const { ProductDetails } = await loadProductDetailsModule();
    const { NotFoundView } = await loadNotFoundViewModule();

    const forbiddenUiPattern =
      /اشترِ|شراء|إتمام الطلب|تسجيل الدخول|إنشاء حساب|كلمة المرور|دفع عند الاستلام|الدفع الإلكتروني|تصفية|ترتيب|المخزون/;

    const homeRender = render(<Home />);
    expect(homeRender.container.querySelectorAll("form, input")).toHaveLength(0);
    expect(homeRender.container.textContent ?? "").not.toMatch(forbiddenUiPattern);

    const detailsRender = render(<ProductDetails product={getProducts()[0]} />);
    expect(detailsRender.container.querySelectorAll("form, input")).toHaveLength(0);
    expect(detailsRender.container.textContent ?? "").not.toMatch(forbiddenUiPattern);

    const notFoundRender = render(<NotFoundView />);
    expect(notFoundRender.container.querySelectorAll("form, input")).toHaveLength(0);
    expect(notFoundRender.container.textContent ?? "").not.toMatch(forbiddenUiPattern);
    expect(notFoundRender.container.textContent ?? "").not.toMatch(/أضف إلى السلة|إضافة إلى السلة/);
  });

  it("AC-9: جميع النصوص والبيانات الوصفية وبيانات المنتجات بالعربية RTL دون روابط صور خارجية", async () => {
    expect(String(rootMetadata.title)).toContain("باندا ستور");
    expect(String(rootMetadata.description)).toMatch(/[\u0600-\u06FF]/);

    const { PRODUCTS } = await loadProductsModule();
    const arabicCharPattern = /[\u0600-\u06FF]/;

    for (const product of PRODUCTS) {
      expect(product.name).toMatch(arabicCharPattern);
      expect(product.description).toMatch(arabicCharPattern);
      expect(product.imageAlt).toMatch(arabicCharPattern);
      expect(product.imageSrc).not.toMatch(/^https?:\/\//i);
    }

    const { container } = render(<Home />);
    const images = container.querySelectorAll("img");
    expect(images.length).toBe(10);
    for (const img of images) {
      const src = img.getAttribute("src") ?? "";
      expect(src).not.toMatch(/^https?:\/\//i);
      expect(img.getAttribute("alt") ?? "").toMatch(arabicCharPattern);
    }
  });
});
