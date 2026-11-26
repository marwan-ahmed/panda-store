import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/layout";

const ROOT_DIR = process.cwd();

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

describe("فحوصات الأمن والحدود والأصول والتكوين", () => {
  it("AB-2: يخلو التطبيق تماماً من Server Actions وواجهات API ومسارات أو أزرار السلة والدفع والإدارة", async () => {
    const srcFiles = collectFiles(path.join(ROOT_DIR, "src"));
    expect(srcFiles.some((f) => /[\\/]api[\\/].*route\.(ts|tsx|js|jsx)$/.test(f))).toBe(false);

    for (const file of srcFiles) {
      if (/\.(ts|tsx|js|jsx)$/.test(file)) {
        const content = fs.readFileSync(file, "utf8");
        expect(content).not.toMatch(/["']use server["']/);
        expect(content).not.toMatch(/\b(stripe|paypal|zaincash|qi-card|checkout)\b/i);
      }
    }

    const { getProducts } = await loadProductsModule();
    const { ProductCard } = await vi.importActual<typeof import("@/components/product-card")>(
      "@/components/product-card"
    );
    const { ProductDetails } = await vi.importActual<
      typeof import("@/components/product-details")
    >("@/components/product-details");
    const { NotFoundView } = await vi.importActual<typeof import("@/components/not-found-view")>(
      "@/components/not-found-view"
    );

    expect(getProducts()).toHaveLength(10);
    expect(typeof ProductCard).toBe("function");
    expect(typeof ProductDetails).toBe("function");
    expect(typeof NotFoundView).toBe("function");
  });

  it("AB-8: ترفض الدوال أي مسارات صور خارجية أو خبيثة وتخلو ملفات SVG العشرة المحلية من السكربتات والأحداث", async () => {
    const { validateProduct } = await loadProductsModule();

    const baseProduct = {
      id: "1",
      name: "منتج باندا تجريبي",
      priceIqd: 10000,
      imageAlt: "وصف صورة باندا تجريبية",
      description: "وصف منتج باندا تجريبي.",
    };

    const unsafeSources = [
      "https://evil.example/x.svg",
      "http://localhost/x.svg",
      "javascript:alert(1)",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "../secret.svg",
    ];
    for (const badSrc of unsafeSources) {
      expect(() => validateProduct({ ...baseProduct, imageSrc: badSrc })).toThrow();
    }

    for (let i = 1; i <= 10; i += 1) {
      const fileName = `product-${String(i).padStart(2, "0")}.svg`;
      const svgPath = path.join(ROOT_DIR, "public", "images", "products", fileName);
      expect(fs.existsSync(svgPath)).toBe(true);

      const svgContent = fs.readFileSync(svgPath, "utf8");
      const byteSize = Buffer.byteLength(svgContent, "utf8");
      expect(byteSize).toBeGreaterThan(0);
      expect(byteSize).toBeLessThan(50 * 1024);
      expect(svgContent).toMatch(/<svg[\s>]/i);
      expect(svgContent).not.toMatch(/<script\b/i);
      expect(svgContent).not.toMatch(/\son[a-z]+\s*=/i);
      expect(svgContent).not.toMatch(/<foreignObject\b/i);
      expect(svgContent).not.toMatch(/javascript:/i);
      expect(svgContent).not.toMatch(/https?:\/\//i);
    }
  });

  it("AB-11: يحافظ التكوين والوكيل والتخطيط والاعتماديات على الإعدادات الآمنة دون أسرار أو إعادة توجيه خارجية", async () => {
    const nextConfigText = fs.readFileSync(path.join(ROOT_DIR, "next.config.ts"), "utf8");
    expect(nextConfigText).not.toMatch(/dangerouslyAllowSVG\s*:\s*true/);
    expect(nextConfigText).not.toMatch(/remotePatterns\s*:/);

    const packageJson = JSON.parse(
      fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    const runtimeDeps = Object.keys(packageJson.dependencies ?? {}).sort();
    expect(runtimeDeps).toEqual(["next", "react", "react-dom"]);

    const rootEntries = fs.readdirSync(ROOT_DIR);
    expect(rootEntries.filter((name) => name.startsWith(".env"))).toEqual([]);

    const trackedSrc = collectFiles(path.join(ROOT_DIR, "src"));
    for (const file of trackedSrc) {
      if (/\.(ts|tsx|js|jsx|css)$/.test(file)) {
        const text = fs.readFileSync(file, "utf8");
        expect(text).not.toMatch(/sk_live_|pk_live_|STRIPE_|PAYPAL_|NEXT_PUBLIC_.*KEY/i);
      }
    }

    const layoutEl = RootLayout({
      children: null,
    } as Parameters<typeof RootLayout>[0]);
    expect(isValidElement(layoutEl)).toBe(true);
    const htmlEl = layoutEl as ReactElement<{ lang?: string; dir?: string }>;
    expect(htmlEl.props.lang).toBe("ar");
    expect(htmlEl.props.dir).toBe("rtl");

    const layoutSource = fs.readFileSync(
      path.join(ROOT_DIR, "src", "app", "layout.tsx"),
      "utf8"
    );
    expect(layoutSource).not.toMatch(/https?:\/\//i);

    const { proxy } = await loadProxyModule();
    const hostileReq = new NextRequest("http://localhost:3000/products/99", {
      headers: {
        host: "evil.example",
        "x-forwarded-host": "evil.example",
        "x-custom-attack": "injected-value",
      },
    });
    const proxyRes = await proxy(hostileReq);
    expect(proxyRes.status).toBe(404);
    expect(proxyRes.headers.get("Location")).toBeNull();
    expect(proxyRes.headers.get("x-custom-attack")).toBeNull();
    const rewrite = proxyRes.headers.get("x-middleware-rewrite");
    expect(rewrite).not.toBeNull();
    expect(new URL(rewrite ?? "").hostname).not.toBe("evil.example");
  });
});
