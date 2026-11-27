import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

async function loadProductsModule() {
  return vi.importActual<typeof import("@/lib/products")>("@/lib/products");
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

async function loadProductPageModule() {
  return vi.importActual<typeof import("@/app/products/[id]/page")>(
    "@/app/products/[id]/page"
  );
}

async function loadProductNotFoundModule() {
  return vi.importActual<typeof import("@/app/products/[id]/not-found")>(
    "@/app/products/[id]/not-found"
  );
}

async function loadProductsIndexModule() {
  return vi.importActual<typeof import("@/app/products/page")>(
    "@/app/products/page"
  );
}

async function loadRootNotFoundModule() {
  return vi.importActual<typeof import("@/app/not-found")>("@/app/not-found");
}

async function loadProxyModule() {
  return vi.importActual<typeof import("@/proxy")>("@/proxy");
}

async function expectNotFoundRejection(run: () => Promise<unknown> | unknown) {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const digest = (caught as { digest?: string }).digest;
  expect(digest ?? (caught as Error).message).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
}

describe("مسارات تفاصيل المنتج والصفحة غير الموجودة والحماية", () => {
  it("AC-6: يعرض مسار /products/3 تفاصيل المنتج الثالث كاملة مع رابط العودة إلى / ويمر من الوكيل بحالة 200", async () => {
    const { getProductById, isValidProductId, formatPriceIqd } = await loadProductsModule();
    const { ProductDetails } = await loadProductDetailsModule();
    const { default: ProductPage, generateStaticParams, generateMetadata } =
      await loadProductPageModule();
    const { proxy } = await loadProxyModule();

    const product3 = getProductById("3");
    expect(product3).toBeDefined();
    expect(isValidProductId("3")).toBe(true);
    if (!product3) return;

    const staticParams = await generateStaticParams();
    expect(staticParams).toHaveLength(10);
    expect(staticParams.map((p) => p.id)).toEqual([
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

    const proxyResponse = await proxy(new NextRequest("http://localhost:3000/products/3"));
    expect(proxyResponse.status).toBe(200);
    expect(proxyResponse.headers.get("x-middleware-next")).toBe("1");
    expect(proxyResponse.headers.get("x-middleware-rewrite")).toBeNull();

    const metaInput = { params: Promise.resolve({ id: "3" }), searchParams: Promise.resolve({}) };
    const metadata = await generateMetadata(metaInput);
    expect(String(metadata.title)).toContain(product3.name);

    const detailsRender = render(<ProductDetails product={product3} />);
    expect(
      detailsRender.getByRole("heading", { level: 1, name: product3.name })
    ).toBeInTheDocument();
    const img = detailsRender.getByRole("img", { name: product3.imageAlt });
    expect(img.getAttribute("src")).toContain(product3.imageSrc);
    expect(detailsRender.getByText(formatPriceIqd(product3.priceIqd))).toBeInTheDocument();
    expect(detailsRender.getByText(product3.description)).toBeInTheDocument();
    expect(detailsRender.getByRole("link", { name: /العودة|الكتالوج/ })).toHaveAttribute("href", "/");
    detailsRender.unmount();

    const pageElement = await ProductPage(metaInput);
    const pageRender = render(pageElement);
    expect(pageRender.getByRole("heading", { level: 1, name: product3.name })).toBeInTheDocument();
    expect(pageRender.getByText(formatPriceIqd(product3.priceIqd))).toBeInTheDocument();
    expect(pageRender.getByRole("link", { name: /العودة|الكتالوج/ })).toHaveAttribute("href", "/");
  });

  it("AC-7: يعيد الوكيل والمسارات حالة 404 مع رسالة المنتج غير موجود ورابط العودة دون كشف مسارات داخلية", async () => {
    const { getProductById, isValidProductId } = await loadProductsModule();
    const { NotFoundView } = await loadNotFoundViewModule();
    const { default: ProductPage, generateMetadata } = await loadProductPageModule();
    const { default: ProductNotFound } = await loadProductNotFoundModule();
    const { default: ProductsIndexPage } = await loadProductsIndexModule();
    const { default: RootNotFound } = await loadRootNotFoundModule();
    const { proxy, config } = await loadProxyModule();

    expect(config.matcher).toEqual(["/products", "/products/:path*"]);
    expect(getProductById("99")).toBeUndefined();
    expect(isValidProductId("99")).toBe(false);

    for (const target of ["/products/99", "/products", "/products/%20"]) {
      const response = await proxy(new NextRequest(`http://localhost:3000${target}`));
      expect(response.status).toBe(404);
      const rewrite = response.headers.get("x-middleware-rewrite");
      expect(rewrite).not.toBeNull();
      expect(new URL(rewrite ?? "").pathname).toBe("/__not-found");
    }

    const missingInput = {
      params: Promise.resolve({ id: "99" }),
      searchParams: Promise.resolve({}),
    };
    await expectNotFoundRejection(() => ProductPage(missingInput));
    await expectNotFoundRejection(() => generateMetadata(missingInput));
    await expectNotFoundRejection(() => ProductsIndexPage());

    for (const view of [<NotFoundView key="v" />, <ProductNotFound key="p" />, <RootNotFound key="r" />]) {
      const rendered = render(view);
      expect(rendered.getByText("المنتج غير موجود")).toBeInTheDocument();
      expect(rendered.getByRole("link", { name: /العودة|الكتالوج/ })).toHaveAttribute("href", "/");
      const text = rendered.container.textContent ?? "";
      expect(text).not.toMatch(/node_modules|D:\\|src\/|Error:|at\s+\w+/);
      rendered.unmount();
    }
  });

  it("EC-4: تعالج جميع المسارات المفقودة أو غير الصحيحة أو المشوهة بترميز URI بحالة 404 دون خطأ 500", async () => {
    const { proxy } = await loadProxyModule();

    const invalidPaths = [
      "/products",
      "/products/",
      "/products/99",
      "/products/0",
      "/products/-1",
      "/products/1/extra",
      "/products/%20",
      "/products/%E0%A4%A",
    ];

    for (const invalidPath of invalidPaths) {
      const response = await proxy(new NextRequest(`http://localhost:3000${invalidPath}`));
      expect(response.status).toBe(404);
      const rewrite = response.headers.get("x-middleware-rewrite");
      expect(rewrite).not.toBeNull();
      expect(new URL(rewrite ?? "").pathname).toBe("/__not-found");
    }
  });

  it("AB-1: يرفض التحكم بالوصول كل مسارات المنتجات المفقودة أو متعددة المقاطع أو الشبيهة باجتياز المسارات بحالة 404", async () => {
    const { proxy } = await loadProxyModule();
    const { default: ProductPage, generateMetadata } = await loadProductPageModule();
    const { default: ProductsIndexPage } = await loadProductsIndexModule();
    const { NotFoundView } = await loadNotFoundViewModule();

    const probePaths = [
      "/products",
      "/products/",
      "/products/99",
      "/products/0",
      "/products/-1",
      "/products/%20",
      "/products/1/extra",
      "/products/..%2F..%2Flayout",
    ];

    for (const probePath of probePaths) {
      const res = await proxy(new NextRequest(`http://localhost:3000${probePath}`));
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(200);
      expect(res.headers.get("Location")).toBeNull();
      const rewrite = res.headers.get("x-middleware-rewrite");
      expect(new URL(rewrite ?? "").pathname).toBe("/__not-found");
    }

    const traversalInput = {
      params: Promise.resolve({ id: "../../layout" }),
      searchParams: Promise.resolve({}),
    };
    await expectNotFoundRejection(() => ProductPage(traversalInput));
    await expectNotFoundRejection(() => generateMetadata(traversalInput));
    await expectNotFoundRejection(() => ProductsIndexPage());

    render(<NotFoundView />);
    expect(screen.getByText("المنتج غير موجود")).toBeInTheDocument();
    expect(screen.queryByText(/layout|99|extra/)).not.toBeInTheDocument();
  });

  it("AB-3: لا يصدر المتجر جلسات أو كوكيز ولا يقرأ cookies() في أي صفحة أو في الوكيل", async () => {
    const { proxy } = await loadProxyModule();
    const { NotFoundView } = await loadNotFoundViewModule();

    for (const target of ["/products/3", "/products/99"]) {
      const res = await proxy(new NextRequest(`http://localhost:3000${target}`));
      expect(res.headers.get("set-cookie")).toBeNull();
    }

    const srcDir = path.join(process.cwd(), "src");
    if (fs.existsSync(srcDir)) {
      const walk = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
          const full = path.join(dir, entry.name);
          return entry.isDirectory() ? walk(full) : [full];
        });
      for (const file of walk(srcDir)) {
        if (/\.(ts|tsx|js|jsx)$/.test(file)) {
          const content = fs.readFileSync(file, "utf8");
          expect(content).not.toMatch(/\bcookies\s*\(/);
        }
      }
    }

    const rendered = render(<NotFoundView />);
    expect(rendered.container.querySelectorAll("input[type='password'], form")).toHaveLength(0);
    expect(rendered.container.textContent ?? "").not.toMatch(/تسجيل الدخول|إنشاء حساب/);
  });

  it("AB-6: يصد مسار المنتج وهيكله أسماء خصائص Object.prototype بحالة 404 دون تسرب أو خطأ 500", async () => {
    const { proxy } = await loadProxyModule();
    const { default: ProductPage } = await loadProductPageModule();

    for (const protoId of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
      const res = await proxy(new NextRequest(`http://localhost:3000/products/${protoId}`));
      expect(res.status).toBe(404);
      const rewrite = res.headers.get("x-middleware-rewrite");
      expect(new URL(rewrite ?? "").pathname).toBe("/__not-found");

      const pageInput = {
        params: Promise.resolve({ id: protoId }),
        searchParams: Promise.resolve({}),
      };
      await expectNotFoundRejection(() => ProductPage(pageInput));
    }
  });

  it("AB-7: يمنع انعكاس حمولات XSS والترميز المشوه في مسارات المنتجات وعرض 404", async () => {
    const { proxy } = await loadProxyModule();
    const { default: ProductPage, generateMetadata } = await loadProductPageModule();
    const { NotFoundView } = await loadNotFoundViewModule();

    const payloads = [
      "/products/<script>alert(1)</script>",
      "/products/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E",
      "/products/%E0%A4%A",
    ];

    for (const payload of payloads) {
      const res = await proxy(new NextRequest(`http://localhost:3000${payload}`));
      expect(res.status).toBe(404);
      const rewrite = res.headers.get("x-middleware-rewrite");
      expect(new URL(rewrite ?? "").pathname).toBe("/__not-found");
    }

    const xssInput = {
      params: Promise.resolve({ id: "<script>alert(1)</script>" }),
      searchParams: Promise.resolve({}),
    };
    await expectNotFoundRejection(() => ProductPage(xssInput));
    await expectNotFoundRejection(() => generateMetadata(xssInput));

    const { container } = render(<NotFoundView />);
    expect(container.innerHTML).not.toContain("<script>");
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.textContent).toContain("المنتج غير موجود");
  });

  it("AB-10: يعالج الوكيل المسارات العميقة والمعرفات الطويلة وحقن الاستعلامات ودفعات الطلبات دون ReDoS أو تمرير query string", async () => {
    const { proxy } = await loadProxyModule();

    const deepPath = "/products/1/a/b/c/d/e/f/g/h/i/j/k";
    const oversizedId = `/products/${"a".repeat(4096)}`;
    const queryAttack = "/products/99?next=https://evil.example&foo=bar";

    for (const pathWithQuery of [deepPath, oversizedId, queryAttack]) {
      const res = await proxy(new NextRequest(`http://localhost:3000${pathWithQuery}`));
      expect(res.status).toBe(404);
      const rewrite = res.headers.get("x-middleware-rewrite");
      expect(rewrite).not.toBeNull();
      const rewriteUrl = new URL(rewrite ?? "");
      expect(rewriteUrl.pathname).toBe("/__not-found");
      expect(rewriteUrl.search).toBe("");
    }

    const burstStart = Date.now();
    for (let i = 0; i < 50; i += 1) {
      const res = await proxy(new NextRequest(`http://localhost:3000/products/invalid-${i}`));
      expect(res.status).toBe(404);
    }
    expect(Date.now() - burstStart).toBeLessThan(2000);
  });
});
