import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const ROOT_DIR = process.cwd();
const ATTACKS_DIR = path.join(ROOT_DIR, ".team", "tasks", "TASK-002", "attacks");
const CART_KEY = "panda-store:cart:v1";

function setupDom() {
  const dom = new JSDOM("<!doctype html><html lang='ar' dir='rtl'><body></body></html>", {
    url: "http://127.0.0.1:3000/cart",
  });

  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "self", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  Object.defineProperty(globalThis, "HTMLElement", { value: dom.window.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, "HTMLInputElement", { value: dom.window.HTMLInputElement, configurable: true });
  Object.defineProperty(globalThis, "StorageEvent", { value: dom.window.StorageEvent, configurable: true });
  Object.defineProperty(globalThis, "Event", { value: dom.window.Event, configurable: true });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true, configurable: true });

  return dom;
}

async function main() {
  const dom = setupDom();

  const nextInteropPlugin = {
    name: "next-cjs-interop",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/src/") && !id.includes("\\src\\")) {
        return null;
      }
      if (!code.includes("next/image") && !code.includes("next/link")) {
        return null;
      }
      return code
        .replaceAll('"next/image"', '"/@next-image"')
        .replaceAll("'next/image'", "'/@next-image'")
        .replaceAll('"next/link"', '"/@next-link"')
        .replaceAll("'next/link'", "'/@next-link'");
    },
    resolveId(id) {
      if (id === "/@next-image" || id === "/@next-link") {
        return `\0${id}`;
      }
      return null;
    },
    load(id) {
      if (id === "\0/@next-image" || id === "\0/@next-link") {
        const target = id === "\0/@next-image" ? "next/image" : "next/link";
        return [
          'import { createRequire } from "node:module";',
          'const req = createRequire(process.cwd() + "/package.json");',
          `const mod = req(${JSON.stringify(target)});`,
          "const c = mod?.default?.default ?? mod?.default ?? mod;",
          "export default c;",
        ].join("\n");
      }
      return null;
    },
  };

  const vite = await createServer({
    root: ROOT_DIR,
    plugins: [nextInteropPlugin, react()],
    resolve: {
      alias: {
        "@": path.join(ROOT_DIR, "src"),
      },
    },
    ssr: {
      external: ["react", "react-dom"],
      noExternal: ["next/image", "next/link"],
    },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "silent",
  });

  try {
    const React = await import("react");
    const testingLib = await import("@testing-library/react");
    const { CartProvider } = await vite.ssrLoadModule("/src/components/cart-provider.tsx");
    const { SiteHeader } = await vite.ssrLoadModule("/src/components/site-header.tsx");
    const { CartView } = await vite.ssrLoadModule("/src/components/cart-view.tsx");

    const { render, fireEvent, cleanup } = testingLib;
    const { Activity, createElement } = React;

    // Quick check: empty cart first (uses Link, not Image)
    dom.window.localStorage.clear();
    const emptyCheck = render(createElement(CartView));
    emptyCheck.unmount();
    cleanup();

    // 1. Seed tampered storage (price forgery + XSS fields + unknown item)
    dom.window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({
        version: 1,
        items: [
          {
            productId: "1",
            quantity: 2,
            priceIqd: 1,
            name: "<script>alert(1)</script>",
            imageSrc: "javascript:alert(1)",
          },
          {
            productId: "99",
            quantity: 5,
          },
        ],
        token: "synthetic-jwt",
      })
    );

    const renderTree = (mode) =>
      createElement(
        Activity,
        { mode },
        createElement(
          CartProvider,
          null,
          createElement(SiteHeader),
          createElement(CartView)
        )
      );

    const view = render(renderTree("visible"));

    const repairedRaw = dom.window.localStorage.getItem(CART_KEY);
    const qtyInput = view.getByLabelText(/كمية/);

    // 2. Inject XSS / invalid string into CartView input without blur
    fireEvent.change(qtyInput, { target: { value: "<script>alert(1)</script>" } });
    const alertAfterXss = view.queryByRole("alert")?.textContent ?? null;
    const inputValueAfterXss = qtyInput.value;
    const htmlContainsRawScript = view.container.innerHTML.includes("<script>alert(1)</script>");
    const cartTextStillShows30k = view.container.textContent?.includes("30,000 د.ع") ?? false;

    // 3. Hide via React Activity (simulates Next.js 16 route switch away from /cart)
    view.rerender(renderTree("hidden"));

    // While hidden, mutate cart via storage event to quantity 5
    dom.window.localStorage.setItem(
      CART_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "1", quantity: 5 }] })
    );
    fireEvent(
      dom.window,
      new dom.window.StorageEvent("storage", {
        key: CART_KEY,
        storageArea: dom.window.localStorage,
      })
    );

    // 4. Re-show CartView via Activity mode="visible"
    view.rerender(renderTree("visible"));
    const alertAfterRestore = view.queryByRole("alert")?.textContent ?? null;
    const inputValueAfterRestore = view.getByLabelText(/كمية/).value;
    const restoredTotalText = view.container.textContent?.includes("75,000 د.ع") ?? false;

    // 5. Trigger max-99 alert, hide Activity, and re-show Activity
    fireEvent.change(view.getByLabelText(/كمية/), { target: { value: "99" } });
    fireEvent.click(view.getByRole("button", { name: /زيادة/ }));
    const alertAt99 = view.queryByRole("alert")?.textContent ?? null;

    view.rerender(renderTree("hidden"));
    view.rerender(renderTree("visible"));
    const alertAt99AfterRestore = view.queryByRole("alert")?.textContent ?? null;
    const inputValueAt99AfterRestore = view.getByLabelText(/كمية/).value;

    cleanup();

    const output = {
      timestamp: new Date().toISOString(),
      repairedStorageJson: repairedRaw,
      afterXssInput: {
        inputValue: inputValueAfterXss,
        alertMessage: alertAfterXss,
        htmlContainsRawScript,
        cartTextStillShows30k,
      },
      afterActivityHideSyncAndRestore: {
        alertMessage: alertAfterRestore,
        inputValue: inputValueAfterRestore,
        restoredTotal75k: restoredTotalText,
      },
      afterMax99AlertHideAndRestore: {
        alertBeforeHide: alertAt99,
        alertAfterRestore: alertAt99AfterRestore,
        inputValueAfterRestore: inputValueAt99AfterRestore,
      },
    };

    const outPath = path.join(ATTACKS_DIR, "cart-activity-probe.json");
    fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await vite.close();
    dom.window.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
