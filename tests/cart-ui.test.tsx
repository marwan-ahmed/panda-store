import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, within } from "@testing-library/react";
import { NextRequest } from "next/server";
import { Activity, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/layout";
import Home from "@/app/page";

const ROOT_DIR = process.cwd();
const CART_KEY = "panda-store:cart:v1";

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full) : [full];
  });
}

async function loadProductsModule() {
  return vi.importActual<typeof import("@/lib/products")>("@/lib/products");
}

async function loadProxyModule() {
  return vi.importActual<typeof import("@/proxy")>("@/proxy");
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

async function loadCartProviderModule() {
  return vi.importActual<typeof import("@/components/cart-provider")>(
    "@/components/cart-provider"
  );
}

async function loadSiteHeaderModule() {
  return vi.importActual<typeof import("@/components/site-header")>(
    "@/components/site-header"
  );
}

async function loadAddToCartButtonModule() {
  return vi.importActual<typeof import("@/components/add-to-cart-button")>(
    "@/components/add-to-cart-button"
  );
}

async function loadCartViewModule() {
  return vi.importActual<typeof import("@/components/cart-view")>(
    "@/components/cart-view"
  );
}

async function loadCartPageModule() {
  return vi.importActual<typeof import("@/app/cart/page")>("@/app/cart/page");
}

async function loadCartStoreModule() {
  return vi.importActual<typeof import("@/lib/cart-store")>("@/lib/cart-store");
}

describe("واجهة السلة والصفحات والضوابط الأمنية", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("AC-1: يعرض التخطيط العام رأس المتجر مع رابط السلة والعداد 0 وأزرار أضف إلى السلة في الرئيسية والتفاصيل", async () => {
    const { getProducts } = await loadProductsModule();
    const { ProductDetails } = await loadProductDetailsModule();
    const { SiteHeader } = await loadSiteHeaderModule();
    const { CartProvider } = await loadCartProviderModule();

    const layoutEl = RootLayout({
      children: <div data-testid="page-slot">محتوى الصفحة</div>,
    } as Parameters<typeof RootLayout>[0]);
    expect(isValidElement(layoutEl)).toBe(true);

    const htmlEl = layoutEl as ReactElement<{ lang?: string; dir?: string; children?: ReactNode }>;
    expect(htmlEl.type).toBe("html");
    expect(htmlEl.props.lang).toBe("ar");
    expect(htmlEl.props.dir).toBe("rtl");

    const bodyEl = htmlEl.props.children as ReactElement<{ children?: ReactNode }>;
    const layoutRender = render(<>{bodyEl.props.children}</>);
    const cartLink = layoutRender.getByRole("link", { name: /السلة/ });
    expect(cartLink).toHaveAttribute("href", "/cart");
    expect(cartLink.textContent).toContain("0");
    expect(layoutRender.getByTestId("page-slot")).toBeInTheDocument();
    layoutRender.unmount();

    const homeRender = render(
      <CartProvider>
        <SiteHeader />
        <Home />
      </CartProvider>
    );
    const cards = homeRender.getAllByRole("article");
    expect(cards).toHaveLength(10);
    for (const [idx, card] of cards.entries()) {
      expect(within(card).getByRole("button", { name: /أضف إلى السلة/ })).toBeInTheDocument();
      expect(within(card).getByRole("link")).toHaveAttribute("href", `/products/${idx + 1}`);
    }
    homeRender.unmount();

    const detailsRender = render(
      <CartProvider>
        <SiteHeader />
        <ProductDetails product={getProducts()[0]} />
      </CartProvider>
    );
    expect(detailsRender.getByRole("button", { name: /أضف إلى السلة/ })).toBeInTheDocument();
  });

  it("AC-2: يحدث النقر على أضف إلى السلة العداد والتخزين المحلي بشكل متطابق عبر البطاقة والتفاصيل", async () => {
    const { getProducts } = await loadProductsModule();
    const { ProductCard } = await loadProductCardModule();
    const { ProductDetails } = await loadProductDetailsModule();
    const { CartProvider } = await loadCartProviderModule();
    const { SiteHeader } = await loadSiteHeaderModule();

    const product1 = getProducts()[0];
    const cardView = render(
      <CartProvider>
        <SiteHeader />
        <ProductCard product={product1} />
      </CartProvider>
    );

    const addBtn = cardView.getByRole("button", { name: /أضف إلى السلة/ });
    fireEvent.click(addBtn);
    expect(cardView.getByRole("link", { name: /السلة/ }).textContent).toContain("1");
    expect(JSON.parse(window.localStorage.getItem(CART_KEY) ?? "{}")).toEqual({
      version: 1,
      items: [{ productId: "1", quantity: 1 }],
    });
    cardView.unmount();

    const detailsView = render(
      <CartProvider>
        <SiteHeader />
        <ProductDetails product={product1} />
      </CartProvider>
    );
    fireEvent.click(detailsView.getByRole("button", { name: /أضف إلى السلة/ }));
    expect(detailsView.getByRole("link", { name: /السلة/ }).textContent).toContain("2");
    expect(JSON.parse(window.localStorage.getItem(CART_KEY) ?? "{}")).toEqual({
      version: 1,
      items: [{ productId: "1", quantity: 2 }],
    });
  });

  it("AC-3: تدعم واجهة السلة الكمية 99 وتمنع تجاوزها مع تنبيه عربي وترفض المدخلات غير الصالحة", async () => {
    const { CartProvider } = await loadCartProviderModule();
    const { SiteHeader } = await loadSiteHeaderModule();
    const { CartView } = await loadCartViewModule();
    const { AddToCartButton } = await loadAddToCartButtonModule();

    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "1", quantity: 2 }] })
    );

    const view = render(
      <CartProvider>
        <SiteHeader />
        <CartView />
        <AddToCartButton productId="1" productName="كوب باندا خزفي" />
      </CartProvider>
    );

    const qtyInput = view.getByLabelText(/كمية/) as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: "99" } });
    expect(view.getAllByText("1,485,000 د.ع").length).toBeGreaterThanOrEqual(1);
    expect(view.getByRole("link", { name: /السلة/ }).textContent).toContain("99");

    fireEvent.click(view.getByRole("button", { name: /\+|زيادة/ }));
    const alertAfterPlus = view.getByRole("alert");
    expect(alertAfterPlus.textContent).toMatch(/99/);
    expect(alertAfterPlus.textContent).toMatch(/[\u0600-\u06FF]/);
    expect(view.getAllByText("1,485,000 د.ع").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(view.getByRole("button", { name: /أضف إلى السلة/ }));
    expect(view.getAllByRole("alert").some((el) => /99/.test(el.textContent ?? ""))).toBe(true);
    view.unmount();

    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "1", quantity: 2 }] })
    );
    const invalidCheck = render(
      <CartProvider>
        <SiteHeader />
        <CartView />
      </CartProvider>
    );

    for (const invalidVal of ["0", "-3", "1.5", "abc", ""]) {
      const input = invalidCheck.getByLabelText(/كمية/) as HTMLInputElement;
      fireEvent.change(input, { target: { value: invalidVal } });
      expect(invalidCheck.getAllByText("30,000 د.ع").length).toBeGreaterThanOrEqual(1);
      expect(invalidCheck.getByRole("link", { name: /السلة/ }).textContent).toContain("2");
      expect(JSON.parse(window.localStorage.getItem(CART_KEY) ?? "{}")).toEqual({
        version: 1,
        items: [{ productId: "1", quantity: 2 }],
      });
      expect(invalidCheck.getByRole("alert").textContent).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it("AC-4: تعطل واجهة السلة الإنقاص عند 1 وتحذف البند المفرد وتفرغ السلة بالكامل", async () => {
    const { CartProvider } = await loadCartProviderModule();
    const { SiteHeader } = await loadSiteHeaderModule();
    const { CartView } = await loadCartViewModule();

    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "2", quantity: 1 }] })
    );

    const minView = render(
      <CartProvider>
        <CartView />
      </CartProvider>
    );
    const decBtn = minView.getByRole("button", { name: /[−\-]|إنقاص|تقليل/ });
    expect(decBtn).toBeDisabled();
    expect(minView.getByText("دفتر ملاحظات باندا")).toBeInTheDocument();
    minView.unmount();

    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({
        version: 1,
        items: [
          { productId: "2", quantity: 2 },
          { productId: "9", quantity: 3 },
        ],
      })
    );

    const multiView = render(
      <CartProvider>
        <SiteHeader />
        <CartView />
      </CartProvider>
    );

    expect(multiView.getByText("41,500 د.ع")).toBeInTheDocument();
    const product2Title = multiView.getByText("دفتر ملاحظات باندا");
    const product2Row = product2Title.closest("li, article, tr, section, div") ?? document.body;
    const removeButtons = within(product2Row as HTMLElement).queryAllByRole("button", {
      name: /حذف/,
    });
    const targetRemoveBtn =
      removeButtons[0] ?? multiView.getAllByRole("button", { name: /حذف/ })[0];
    fireEvent.click(targetRemoveBtn);

    expect(multiView.queryByText("دفتر ملاحظات باندا")).not.toBeInTheDocument();
    expect(multiView.getByText("مجموعة أقلام وملصقات باندا")).toBeInTheDocument();
    expect(multiView.getByRole("link", { name: /السلة/ }).textContent).toContain("3");
    expect(multiView.getAllByText("22,500 د.ع").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(multiView.getByRole("button", { name: /إفراغ السلة/ }));
    expect(multiView.getByRole("link", { name: /السلة/ }).textContent).toContain("0");
    expect(multiView.getByText("0 د.ع")).toBeInTheDocument();
  });

  it("AC-6: يعرض المسار /cart حالة الفراغ وحالة الامتلاء الكاملة باللغة العربية ورابط العودة للكتالوج", async () => {
    const { default: CartPage, metadata } = await loadCartPageModule();

    expect(String(metadata.title)).toContain("سلة التسوق");

    const emptyRender = render(<CartPage />);
    expect(emptyRender.getByRole("heading", { level: 1, name: "سلة التسوق" })).toBeInTheDocument();
    expect(emptyRender.getByText("0 د.ع")).toBeInTheDocument();
    expect(emptyRender.getByText(/فارغة/)).toBeInTheDocument();
    expect(emptyRender.getByRole("link", { name: /العودة|الكتالوج/ })).toHaveAttribute("href", "/");
    emptyRender.unmount();

    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({
        version: 1,
        items: [
          { productId: "2", quantity: 2 },
          { productId: "9", quantity: 3 },
        ],
      })
    );

    const filledRender = render(<CartPage />);
    expect(filledRender.getByRole("heading", { level: 1, name: "سلة التسوق" })).toBeInTheDocument();
    expect(filledRender.getByText("دفتر ملاحظات باندا")).toBeInTheDocument();
    expect(filledRender.getByText("مجموعة أقلام وملصقات باندا")).toBeInTheDocument();
    expect(filledRender.getByText("9,500 د.ع")).toBeInTheDocument();
    expect(filledRender.getByText("19,000 د.ع")).toBeInTheDocument();
    expect(filledRender.getByText("7,500 د.ع")).toBeInTheDocument();
    expect(filledRender.getByText("22,500 د.ع")).toBeInTheDocument();
    expect(filledRender.getByText("41,500 د.ع")).toBeInTheDocument();

    const imgs = filledRender.getAllByRole("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute("src")).toContain("/images/products/product-02.svg");
    expect(imgs[0].getAttribute("alt")).toMatch(/[\u0600-\u06FF]/);
    expect(filledRender.getAllByRole("button", { name: /حذف/ })).toHaveLength(2);
    expect(filledRender.getByRole("button", { name: /إفراغ السلة/ })).toBeInTheDocument();
    expect(filledRender.getByRole("link", { name: /العودة|الكتالوج/ })).toHaveAttribute("href", "/");
  });

  it("AC-7: تتزامن واجهة الرأس والسلة بعد إعادة التركيب وعند استقبال حدث storage بين التبويبات", async () => {
    const { getProducts } = await loadProductsModule();
    const { ProductCard } = await loadProductCardModule();
    const { CartProvider } = await loadCartProviderModule();
    const { SiteHeader } = await loadSiteHeaderModule();
    const { CartView } = await loadCartViewModule();

    const firstMount = render(
      <CartProvider>
        <SiteHeader />
        <ProductCard product={getProducts()[0]} />
      </CartProvider>
    );
    const addBtn = firstMount.getByRole("button", { name: /أضف إلى السلة/ });
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    firstMount.unmount();

    const secondMount = render(
      <CartProvider>
        <SiteHeader />
        <CartView />
      </CartProvider>
    );
    expect(secondMount.getByRole("link", { name: /السلة/ }).textContent).toContain("2");
    expect(secondMount.getByText("كوب باندا خزفي")).toBeInTheDocument();
    expect(secondMount.getByText("30,000 د.ع")).toBeInTheDocument();

    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "2", quantity: 1 }] })
    );
    fireEvent(
      window,
      new StorageEvent("storage", {
        key: CART_KEY,
        storageArea: window.localStorage,
      })
    );
    expect(secondMount.getByRole("link", { name: /السلة/ }).textContent).toContain("1");
    expect(secondMount.getByText("دفتر ملاحظات باندا")).toBeInTheDocument();
    expect(secondMount.getAllByText("9,500 د.ع").length).toBeGreaterThanOrEqual(1);
  });

  it("AC-9: تخلو جميع المسارات والمكونات من نماذج الطلب والدفع والخصومات والمصادقة وتبقى مسارات الكتالوج و 404 سليمة", async () => {
    const { getProducts } = await loadProductsModule();
    const { proxy } = await loadProxyModule();
    const { ProductDetails } = await loadProductDetailsModule();
    const { CartProvider } = await loadCartProviderModule();
    const { SiteHeader } = await loadSiteHeaderModule();
    const { default: CartPage } = await loadCartPageModule();

    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "1", quantity: 1 }] })
    );

    const forbiddenText =
      /إتمام الطلب|اشترِ|دفع عند الاستلام|الدفع الإلكتروني|كود خصم|كوبون|ضريبة|رسوم التوصيل|تسجيل الدخول|إنشاء حساب|كلمة المرور|رقم الهاتف|العنوان الكامل/;

    for (const ui of [
      <CartProvider key="h">
        <SiteHeader />
        <Home />
      </CartProvider>,
      <CartProvider key="d">
        <SiteHeader />
        <ProductDetails product={getProducts()[0]} />
      </CartProvider>,
      <CartProvider key="c">
        <SiteHeader />
        <CartPage />
      </CartProvider>,
    ]) {
      const rendered = render(ui);
      expect(rendered.container.querySelectorAll("form")).toHaveLength(0);
      expect(rendered.container.querySelectorAll('input[type="password"], input[type="tel"]')).toHaveLength(0);
      expect(rendered.container.textContent ?? "").not.toMatch(forbiddenText);
      rendered.unmount();
    }

    const notFoundCartProxy = await proxy(new NextRequest("http://localhost:3000/products/cart"));
    expect(notFoundCartProxy.status).toBe(404);
    const validProductProxy = await proxy(new NextRequest("http://localhost:3000/products/1"));
    expect(validProductProxy.status).toBe(200);
  });

  it("AB-1: يفرض التحكم بالوصول غياب نقاط API و Server Actions ونماذج الدفع واستمرار 404 على /products/cart", async () => {
    const { proxy } = await loadProxyModule();
    const { default: CartPage } = await loadCartPageModule();
    const { SiteHeader } = await loadSiteHeaderModule();
    const { CartView } = await loadCartViewModule();

    const srcFiles = collectFiles(path.join(ROOT_DIR, "src"));
    expect(srcFiles.some((f) => /[\\/]api[\\/].*route\.(ts|tsx|js|jsx)$/.test(f))).toBe(false);
    for (const file of srcFiles) {
      if (/\.(ts|tsx|js|jsx)$/.test(file)) {
        const text = fs.readFileSync(file, "utf8");
        expect(text).not.toMatch(/["']use server["']/);
        expect(text).not.toMatch(/\b(stripe|paypal|zaincash|qi-card|checkout)\b/i);
      }
    }

    for (const probe of ["/products/cart", "/products/99"]) {
      const res = await proxy(new NextRequest(`http://localhost:3000${probe}`));
      expect(res.status).toBe(404);
      const rewrite = res.headers.get("x-middleware-rewrite");
      expect(new URL(rewrite ?? "").pathname).toBe("/__not-found");
    }

    const cartRender = render(
      <>
        <SiteHeader />
        <CartPage />
      </>
    );
    expect(typeof CartView).toBe("function");
    expect(cartRender.container.querySelectorAll("form")).toHaveLength(0);
    expect(cartRender.container.textContent ?? "").not.toMatch(
      /إتمام الطلب|دفع عند الاستلام|الدفع الإلكتروني|كود خصم|تسجيل الدخول|كلمة المرور/
    );
  });

  it("AB-2: تخلو ملفات السلة من cookies() و Set-Cookie ونماذج تسجيل الدخول وتجرد حقول الجلسات", async () => {
    const { proxy } = await loadProxyModule();
    const { CartProvider } = await loadCartProviderModule();
    const { default: CartPage } = await loadCartPageModule();

    const srcFiles = collectFiles(path.join(ROOT_DIR, "src"));
    for (const file of srcFiles) {
      if (/\.(ts|tsx|js|jsx)$/.test(file)) {
        expect(fs.readFileSync(file, "utf8")).not.toMatch(/\bcookies\s*\(/);
      }
    }

    const proxyRes = await proxy(new NextRequest("http://localhost:3000/products/1"));
    expect(proxyRes.headers.get("set-cookie")).toBeNull();

    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({
        version: 1,
        items: [{ productId: "1", quantity: 1 }],
        token: "fake-jwt",
        sessionId: "abc",
        password: "123",
      })
    );

    const rendered = render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );
    expect(rendered.container.querySelectorAll('form, input[type="password"]')).toHaveLength(0);
    expect(rendered.container.textContent ?? "").not.toMatch(/تسجيل الدخول|إنشاء حساب|كلمة المرور/);

    const repaired = window.localStorage.getItem(CART_KEY) ?? "";
    expect(repaired).not.toContain("fake-jwt");
    expect(repaired).not.toContain("sessionId");
    expect(repaired).not.toContain("password");
  });

  it("AB-8: تمنع واجهة السلة حقن XSS من localStorage أو إدخال الكمية ولا تحتوي dangerouslySetInnerHTML", async () => {
    const { CartProvider } = await loadCartProviderModule();
    const { CartView } = await loadCartViewModule();
    const { default: CartPage } = await loadCartPageModule();

    window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({
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
      })
    );

    const view = render(
      <CartProvider>
        <CartPage />
      </CartProvider>
    );

    expect(view.container.innerHTML).not.toContain("<script>");
    expect(view.container.innerHTML).not.toContain("javascript:");
    expect(view.container.innerHTML).not.toContain("onerror=");
    expect(view.getByText("كوب باندا خزفي")).toBeInTheDocument();

    const qtyInput = view.getByLabelText(/كمية/);
    fireEvent.change(qtyInput, { target: { value: "<script>alert(1)</script>" } });
    expect(view.container.innerHTML).not.toContain("<script>alert(1)</script>");
    expect(view.getByText("15,000 د.ع")).toBeInTheDocument();
    expect(typeof CartView).toBe("function");

    for (const rel of [
      "src/components/cart-view.tsx",
      "src/components/add-to-cart-button.tsx",
      "src/app/cart/page.tsx",
    ]) {
      const source = fs.readFileSync(path.join(ROOT_DIR, rel), "utf8");
      expect(source).not.toMatch(/dangerouslySetInnerHTML|innerHTML|\beval\s*\(|searchParams/);
    }
  });

  it("AB-12: يتوافق المخزن والمكونات مع Activity وتصيير الخادم الحتمي والاختبار المنفرد وإعدادات Next.js الآمنة", async () => {
    const { getServerCartSnapshot } = await loadCartStoreModule();
    const { AddToCartButton } = await loadAddToCartButtonModule();
    const { CartView } = await loadCartViewModule();

    const serverSnap = getServerCartSnapshot();
    expect(serverSnap.itemCount).toBe(0);
    expect(serverSnap.cartTotalIqd).toBe(0);

    const standaloneCart = render(<CartView />);
    expect(standaloneCart.getByRole("heading", { level: 1, name: "سلة التسوق" })).toBeInTheDocument();
    standaloneCart.unmount();

    const activityRender = render(
      <Activity mode="visible">
        <AddToCartButton productId="1" productName="كوب باندا خزفي" />
      </Activity>
    );
    fireEvent.click(activityRender.getByRole("button", { name: /أضف إلى السلة/ }));
    expect(activityRender.getByRole("status")).toBeInTheDocument();

    activityRender.rerender(
      <Activity mode="hidden">
        <AddToCartButton productId="1" productName="كوب باندا خزفي" />
      </Activity>
    );
    activityRender.rerender(
      <Activity mode="visible">
        <AddToCartButton productId="1" productName="كوب باندا خزفي" />
      </Activity>
    );
    expect(activityRender.queryByRole("status")).not.toBeInTheDocument();

    const nextConfigText = fs.readFileSync(path.join(ROOT_DIR, "next.config.ts"), "utf8");
    expect(nextConfigText).not.toMatch(/dangerouslyAllowSVG\s*:\s*true/);
    expect(nextConfigText).not.toMatch(/remotePatterns\s*:/);
  });

  it("AC-10: تحافظ الواجهة على العربية RTL والاعتماديات المعتمدة دون طلبات خارجية أو أسرار أو بيانات شخصية حقيقية", async () => {
    const { formatCartTotalIqd } = await loadCartModuleCompat();
    const { default: CartPage, metadata } = await loadCartPageModule();
    const { SiteHeader } = await loadSiteHeaderModule();
    const { AddToCartButton } = await loadAddToCartButtonModule();

    expect(formatCartTotalIqd(0)).toBe("0 د.ع");
    expect(String(metadata.title)).toMatch(/[\u0600-\u06FF]/);

    const layoutEl = RootLayout({
      children: null,
    } as Parameters<typeof RootLayout>[0]) as ReactElement<{ lang?: string; dir?: string }>;
    expect(layoutEl.props.lang).toBe("ar");
    expect(layoutEl.props.dir).toBe("rtl");

    const uiRender = render(
      <>
        <SiteHeader />
        <AddToCartButton productId="1" productName="كوب باندا خزفي" />
        <CartPage />
      </>
    );
    expect(uiRender.container.textContent).toMatch(/[\u0600-\u06FF]/);
  });

  it("AB-13: يتحقق فحص الاعتماديات والأسرار والروابط من بقاء الحزمة نظيفة وعربية RTL", async () => {
    const { default: CartPage, metadata } = await loadCartPageModule();

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(packageJson.dependencies ?? {}).sort()).toEqual([
      "next",
      "react",
      "react-dom",
    ]);

    expect(fs.readdirSync(ROOT_DIR).filter((name) => name.startsWith(".env"))).toEqual([]);

    for (const file of collectFiles(path.join(ROOT_DIR, "src"))) {
      if (/\.(ts|tsx|js|jsx|css)$/.test(file)) {
        const text = fs.readFileSync(file, "utf8");
        expect(text).not.toMatch(/sk_live_|pk_live_|STRIPE_|PAYPAL_|NEXT_PUBLIC_.*KEY/i);
        expect(text).not.toMatch(/https?:\/\//i);
      }
    }

    const layoutEl = RootLayout({
      children: null,
    } as Parameters<typeof RootLayout>[0]) as ReactElement<{ lang?: string; dir?: string }>;
    expect(layoutEl.props.lang).toBe("ar");
    expect(layoutEl.props.dir).toBe("rtl");
    expect(String(metadata.title)).toContain("سلة التسوق");
    expect(typeof CartPage).toBe("function");
  });
});

async function loadCartModuleCompat() {
  return vi.importActual<typeof import("@/lib/cart")>("@/lib/cart");
}
