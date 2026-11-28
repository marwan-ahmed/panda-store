import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT_DIR = process.cwd();
const ATTACKS_DIR = path.join(ROOT_DIR, ".team", "tasks", "TASK-002", "attacks");
const HOST = "127.0.0.1";
const PORT = 3000;
const BASE_URL = `http://${HOST}:${PORT}`;

// Resolve "@/..." to "<ROOT_DIR>/src/..." so Node 24 can execute TypeScript domain modules directly.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = path.join(ROOT_DIR, "src", specifier.slice(2));
      for (const ext of [".ts", ".tsx", ".js", ".mjs", ""]) {
        const candidate = `${base}${ext}`;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

function rawHttpRequest({ method = "GET", pathAndQuery, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        method,
        path: pathAndQuery,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            method,
            path: pathAndQuery,
            status: res.statusCode ?? 0,
            headers: res.headers,
            bodyLength: Buffer.byteLength(text, "utf8"),
            body: text,
          });
        });
      }
    );
    req.on("error", reject);
    if (body !== null) {
      req.write(body);
    }
    req.end();
  });
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await rawHttpRequest({ pathAndQuery: "/" });
      if (res.status === 200) return;
    } catch {
      // Server still starting.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for next start on http://127.0.0.1:3000");
}

function summarizeResponse(res, extra = {}) {
  return {
    method: res.method,
    path: res.path,
    status: res.status,
    contentType: res.headers["content-type"] ?? null,
    location: res.headers["location"] ?? null,
    setCookie: res.headers["set-cookie"] ?? null,
    cacheControl: res.headers["cache-control"] ?? null,
    nextjsCache: res.headers["x-nextjs-cache"] ?? null,
    xPoweredBy: res.headers["x-powered-by"] ?? null,
    xContentTypeOptions: res.headers["x-content-type-options"] ?? null,
    contentSecurityPolicy: res.headers["content-security-policy"] ?? null,
    xFrameOptions: res.headers["x-frame-options"] ?? null,
    referrerPolicy: res.headers["referrer-policy"] ?? null,
    permissionsPolicy: res.headers["permissions-policy"] ?? null,
    accessControlAllowOrigin: res.headers["access-control-allow-origin"] ?? null,
    bodyLength: res.bodyLength,
    ...extra,
  };
}

function inspectHtmlFlags(html) {
  const articleCount = (html.match(/<article\b/g) || []).length;
  const addToCartCount = (html.match(/أضف إلى السلة/g) || []).length;
  const formCount = (html.match(/<form\b/gi) || []).length;
  const inputCount = (html.match(/<input\b/gi) || []).length;
  return {
    hasArabicRtlHtml: /<html[^>]*\blang="ar"[^>]*\bdir="rtl"/i.test(html),
    articleCount,
    addToCartCount,
    formCount,
    inputCount,
    hasCartLink: html.includes('href="/cart"'),
    hasHomeLink: html.includes('href="/"'),
    hasForbiddenScopeTerms: /إتمام الطلب|دفع عند الاستلام|الدفع الإلكتروني|كود خصم|تسجيل الدخول|كلمة المرور/.test(html),
    hasStackOrLocalPathLeak: /D:\\ajeeb-app|MARWAN-AHMED|at Object\.|Error: /i.test(html),
  };
}

async function main() {
  const nextBin = path.join(ROOT_DIR, "node_modules", "next", "dist", "bin", "next");
  const server = spawn(process.execPath, [nextBin, "start", "-H", HOST, "-p", String(PORT)], {
    cwd: ROOT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdoutLog = "";
  let stderrLog = "";
  server.stdout.on("data", (d) => {
    stdoutLog += d.toString("utf8");
  });
  server.stderr.on("data", (d) => {
    stderrLog += d.toString("utf8");
  });

  const results = {
    timestamp: new Date().toISOString(),
    target: BASE_URL,
    ab1_access_control: {},
    ab2_authentication: {},
    ab3_to_ab11_domain_storage: {},
    ab8_ab12_xss_rsc_hydration: {},
    ab11_burst: {},
    ab13_headers_host_bundle: {},
    server_logs: {},
  };

  try {
    await waitForServer();

    // --- AB-1: Access control & route boundaries ---
    const homeRes = await rawHttpRequest({ pathAndQuery: "/" });
    const cartRes = await rawHttpRequest({ pathAndQuery: "/cart" });
    const product1Res = await rawHttpRequest({ pathAndQuery: "/products/1" });
    const product10Res = await rawHttpRequest({ pathAndQuery: "/products/10" });

    const productIdsSummary = {};
    for (let i = 1; i <= 10; i += 1) {
      const r = i === 1 ? product1Res : i === 10 ? product10Res : await rawHttpRequest({ pathAndQuery: `/products/${i}` });
      productIdsSummary[`/products/${i}`] = {
        status: r.status,
        hasAddToCart: r.body.includes("أضف إلى السلة"),
        hasCartLink: r.body.includes('href="/cart"'),
        formCount: (r.body.match(/<form\b/gi) || []).length,
      };
    }

    const forbiddenProbes = {};
    for (const p of [
      "/products/cart",
      "/products/99",
      "/products",
      "/products/0",
      "/products/-1",
      "/products/1/extra",
      "/cart/checkout",
      "/cart/extra",
      "/checkout",
      "/api/cart",
      "/api/health",
    ]) {
      const r = await rawHttpRequest({ pathAndQuery: p });
      forbiddenProbes[p] = summarizeResponse(r, {
        hasArabicNotFound: r.body.includes("المنتج غير موجود"),
        hasStackOrLocalPathLeak: /D:\\ajeeb-app|MARWAN-AHMED|at Object\./i.test(r.body),
      });
    }

    const trailingCartRes = await rawHttpRequest({ pathAndQuery: "/cart/" });
    const trailingProductsRes = await rawHttpRequest({ pathAndQuery: "/products/" });

    const postProbes = {};
    for (const reqSpec of [
      { name: "POST /cart", method: "POST", pathAndQuery: "/cart", headers: {}, body: "" },
      {
        name: "POST /cart (Next-Action)",
        method: "POST",
        pathAndQuery: "/cart",
        headers: { "Next-Action": "deadbeef0123456789", "Content-Type": "text/plain;charset=UTF-8" },
        body: "[]",
      },
      {
        name: "POST / (Next-Action)",
        method: "POST",
        pathAndQuery: "/",
        headers: { "Next-Action": "deadbeef0123456789", "Content-Type": "text/plain;charset=UTF-8" },
        body: "[]",
      },
      {
        name: "POST /api/cart",
        method: "POST",
        pathAndQuery: "/api/cart",
        headers: { "Content-Type": "application/json" },
        body: '{"productId":"1","quantity":1}',
      },
    ]) {
      const r = await rawHttpRequest(reqSpec);
      postProbes[reqSpec.name] = summarizeResponse(r, {
        bodySnippet: r.body.slice(0, 220),
        hasStackOrLocalPathLeak: /D:\\ajeeb-app|MARWAN-AHMED|at Object\./i.test(r.body),
      });
    }

    results.ab1_access_control = {
      home: summarizeResponse(homeRes, inspectHtmlFlags(homeRes.body)),
      cart: summarizeResponse(cartRes, {
        ...inspectHtmlFlags(cartRes.body),
        hasTitleCart: /سلة التسوق \| باندا ستور/.test(cartRes.body),
        hasH1Cart: /<h1[^>]*>سلة التسوق<\/h1>/.test(cartRes.body),
        hasEmptyCartMsg: cartRes.body.includes("سلة التسوق فارغة حالياً."),
        hasZeroIqd: cartRes.body.includes("0 د.ع"),
      }),
      products_1_to_10: productIdsSummary,
      not_found_probes: forbiddenProbes,
      trailing_slashes: {
        "/cart/": summarizeResponse(trailingCartRes),
        "/products/": summarizeResponse(trailingProductsRes),
      },
      post_and_server_action_probes: postProbes,
    };

    // --- AB-2: Authentication & Cookie absence ---
    const authRoutes = {};
    for (const p of ["/login", "/signup", "/account", "/api/auth/session"]) {
      const r = await rawHttpRequest({ pathAndQuery: p });
      authRoutes[p] = summarizeResponse(r, {
        hasArabicNotFound: r.body.includes("المنتج غير موجود"),
      });
    }
    const forgedAuthCart = await rawHttpRequest({
      pathAndQuery: "/cart",
      headers: {
        Cookie: "session=synthetic-session-id; auth=fake",
        Authorization: "Bearer synthetic-token",
        "X-User-Role": "admin",
      },
    });
    results.ab2_authentication = {
      auth_routes: authRoutes,
      forged_headers_on_cart: summarizeResponse(forgedAuthCart, {
        identicalBodyToAnonymous: forgedAuthCart.body === cartRes.body,
        hasForgedReflection: /synthetic-session-id|synthetic-token/.test(forgedAuthCart.body),
      }),
    };

    // --- AB-8 & AB-12: XSS query/raw probes, RSC prefetch, SSR hydration state ---
    const xssProbes = {};
    for (const [label, q] of [
      ["encoded_msg_script", "/cart?msg=%3Cscript%3Ealert(1)%3C%2Fscript%3E"],
      ["raw_msg_script", "/cart?msg=<script>alert(1)</script>"],
      ["img_onerror", "/cart?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E"],
      ["proto_query", "/cart?__proto__[polluted]=1&constructor[prototype][polluted]=1"],
    ]) {
      const r = await rawHttpRequest({ pathAndQuery: q });
      xssProbes[label] = summarizeResponse(r, {
        reflectsRawScript: r.body.includes("<script>alert(1)</script>"),
        reflectsOnerror: r.body.includes("onerror=alert(1)"),
        reflectsPolluted: r.body.includes("polluted"),
        stillRendersCartHeading: r.body.includes("سلة التسوق"),
      });
    }

    const rscProbes = {};
    for (const p of ["/", "/products/1", "/cart", "/products/cart", "/products/99"]) {
      const headers = {
        RSC: "1",
        "Next-Router-Prefetch": "1",
      };
      let r = await rawHttpRequest({ pathAndQuery: p, headers });
      let redirectLocation = null;
      if (r.status === 307 && r.headers.location && r.headers.location.startsWith("/")) {
        redirectLocation = r.headers.location;
        r = await rawHttpRequest({ pathAndQuery: redirectLocation, headers });
      }
      rscProbes[p] = summarizeResponse(r, {
        initialRedirectLocation: redirectLocation,
        containsZeroIqd: r.body.includes("0 د.ع"),
        containsCartKeyOrMarker: r.body.includes("سلة التسوق") || r.body.includes("السلة"),
        containsStackOrLocalPath: /D:\\ajeeb-app|MARWAN-AHMED|at Object\./i.test(r.body),
        containsSecrets: /sk_live_|pk_live_|STRIPE_|PAYPAL_|NEXT_PUBLIC_/i.test(r.body),
        containsTamperedPriceLeak: r.body.includes("priceIqd") && r.body.includes("cartTotalIqd"),
      });
    }

    const rscXssInitial = await rawHttpRequest({
      pathAndQuery: "/cart?msg=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      headers: { RSC: "1" },
    });
    const rscXssTarget =
      rscXssInitial.status === 307 && rscXssInitial.headers.location?.startsWith("/")
        ? rscXssInitial.headers.location
        : "/cart?msg=%3Cscript%3Ealert(1)%3C%2Fscript%3E";
    const rscXssCart = await rawHttpRequest({
      pathAndQuery: rscXssTarget,
      headers: { RSC: "1" },
    });

    const methodProbes = {};
    for (const method of ["HEAD", "OPTIONS", "PUT", "DELETE", "PATCH"]) {
      const r = await rawHttpRequest({ method, pathAndQuery: "/cart" });
      methodProbes[method] = summarizeResponse(r);
    }

    results.ab8_ab12_xss_rsc_hydration = {
      xss_query_probes: xssProbes,
      rsc_probes: rscProbes,
      rsc_xss_query: summarizeResponse(rscXssCart, {
        initialStatus: rscXssInitial.status,
        initialRedirectLocation: rscXssInitial.headers.location ?? null,
        reflectsRawScript: rscXssCart.body.includes("<script>alert(1)</script>"),
        reflectsEncodedScript: rscXssCart.body.includes("%3Cscript%3Ealert(1)"),
        containsZeroIqd: rscXssCart.body.includes("0 د.ع"),
      }),
      method_probes_on_cart: methodProbes,
      ssr_empty_cart_determinism: {
        homeHasInitialZeroBadge: />0</.test(homeRes.body),
        cartHasInitialZeroBadge: />0</.test(cartRes.body),
        cartHasInitialZeroTotal: cartRes.body.includes("0 د.ع"),
      },
    };

    // --- AB-11: Burst resilience (30 rapid requests <= 50) ---
    const burstStart = Date.now();
    const burstCart = await Promise.all(
      Array.from({ length: 15 }, () => rawHttpRequest({ pathAndQuery: "/cart" }))
    );
    const burstNotFound = await Promise.all(
      Array.from({ length: 15 }, () => rawHttpRequest({ pathAndQuery: "/products/cart" }))
    );
    results.ab11_burst = {
      totalRequests: 30,
      durationMs: Date.now() - burstStart,
      cartStatuses: burstCart.map((r) => r.status),
      productsCartStatuses: burstNotFound.map((r) => r.status),
    };

    // --- AB-13: Host injection, security headers, SVG, compiled client chunks ---
    const hostProbeCart = await rawHttpRequest({
      pathAndQuery: "/cart",
      headers: {
        Host: "evil.example",
        "X-Forwarded-Host": "evil.example",
        Origin: "https://evil.example",
        "X-Custom-Probe": "probe-value",
      },
    });
    const hostProbeSlashCart = await rawHttpRequest({
      pathAndQuery: "/cart/",
      headers: {
        Host: "evil.example",
        "X-Forwarded-Host": "evil.example",
        Origin: "https://evil.example",
      },
    });
    const svgRes = await rawHttpRequest({ pathAndQuery: "/images/products/product-01.svg" });

    const chunksDir = path.join(ROOT_DIR, ".next", "static", "chunks");
    const chunkFiles = fs.readdirSync(chunksDir).filter((f) => f.endsWith(".js"));
    const chunkAudit = chunkFiles.map((f) => {
      const txt = fs.readFileSync(path.join(chunksDir, f), "utf8");
      const isAppCartChunk =
        txt.includes("panda-store:cart:v1") ||
        txt.includes("سلة التسوق") ||
        txt.includes("أضف إلى السلة");
      return {
        file: f,
        bytes: Buffer.byteLength(txt, "utf8"),
        isAppCartChunk,
        secretsMatched: txt.match(/(sk_live_|pk_live_|STRIPE_|PAYPAL_|NEXT_PUBLIC_|zaincash|qi-card)/gi) || [],
        localPathOrPiiMatched: txt.match(/(ajeeb-app|MARWAN-AHMED|077\d{8}|@gmail\.com)/gi) || [],
        hasDangerouslySetInnerHTML: txt.includes("dangerouslySetInnerHTML"),
        hasInnerHTML: txt.includes(".innerHTML"),
        hasEval: /\beval\s*\(/.test(txt),
      };
    });

    results.ab13_headers_host_bundle = {
      headers_cart: summarizeResponse(cartRes),
      headers_home: summarizeResponse(homeRes),
      headers_product_1: summarizeResponse(product1Res),
      headers_svg: summarizeResponse(svgRes),
      host_probe_cart: summarizeResponse(hostProbeCart, {
        reflectsEvilHostInBody: hostProbeCart.body.includes("evil.example"),
        reflectsEvilHostInHeaders: JSON.stringify(hostProbeCart.headers).includes("evil.example"),
        reflectsCustomHeader: "x-custom-probe" in hostProbeCart.headers,
      }),
      host_probe_trailing_cart: summarizeResponse(hostProbeSlashCart, {
        reflectsEvilHostInHeaders: JSON.stringify(hostProbeSlashCart.headers).includes("evil.example"),
      }),
      client_chunks_count: chunkAudit.length,
      client_chunks: chunkAudit,
    };

    // --- AB-3 to AB-11: Direct Node execution against TS domain/storage modules ---
    const cartMod = await import(pathToFileURL(path.join(ROOT_DIR, "src", "lib", "cart.ts")).href);
    const storageMod = await import(pathToFileURL(path.join(ROOT_DIR, "src", "lib", "cart-storage.ts")).href);
    const productsMod = await import(pathToFileURL(path.join(ROOT_DIR, "src", "lib", "products.ts")).href);

    const ab3Tampered = storageMod.parseStoredCart(
      JSON.stringify({
        version: 1,
        items: [{ productId: "1", quantity: 2, priceIqd: 1, name: "hacked", imageSrc: "https://evil.example/x.svg" }],
        cartTotalIqd: 2,
      })
    );
    const ab3Built = cartMod.buildCart(ab3Tampered.items);

    const ab4Merged = storageMod.parseStoredCart(
      JSON.stringify({
        version: 1,
        items: [
          { productId: "1", quantity: 60 },
          { productId: "1", quantity: 50 },
        ],
      })
    );
    const ab4AtMax = cartMod.addToCart([{ productId: "1", quantity: 99 }], "1");

    const ab5BadInputs = ["0", "-0", "-3", "1.5", "1abc", "1e2", "+1", "0x10", "", "   ", "100", "99999999999999999999"];
    const ab5Results = Object.fromEntries(
      ab5BadInputs.map((val) => [val, cartMod.parseQuantityInput(val)])
    );

    const ab6MaxCart = cartMod.buildCart(productsMod.PRODUCTS.map((p) => ({ productId: p.id, quantity: 99 })));
    const ab6NegZeroFormat = cartMod.formatCartTotalIqd(-0);
    let productsZeroThrows = false;
    try {
      productsMod.formatPriceIqd(0);
    } catch {
      productsZeroThrows = true;
    }

    const ab7ProtoParsed = storageMod.parseStoredCart(
      '{"version":1,"items":[{"productId":"1","quantity":2,"__proto__":{"polluted":true}}],"__proto__":{"rootPolluted":true}}'
    );
    const ab7ProtoIds = ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"].map((id) => ({
      id,
      ok: cartMod.addToCart([], id).ok,
    }));

    const ab8XssParsed = storageMod.parseStoredCart(
      JSON.stringify({
        version: 1,
        items: [
          { productId: "1", quantity: 1, name: "<script>alert(1)</script>", imageSrc: "javascript:alert(1)" },
          { productId: "<img src=x onerror=alert(1)>", quantity: 1 },
        ],
      })
    );

    const ab9Serialized = storageMod.serializeCart([{ productId: "1", quantity: 2 }]);

    const ab10Version99 = storageMod.parseStoredCart(
      JSON.stringify({ version: 99, items: [{ productId: "1", quantity: 2 }] })
    );
    const ab10Malformed = storageMod.parseStoredCart("{bad");

    const ab11OversizedStart = Date.now();
    const ab11Oversized = storageMod.parseStoredCart("x".repeat(70000));
    const ab11OversizedMs = Date.now() - ab11OversizedStart;
    const ab11Many = storageMod.parseStoredCart(
      JSON.stringify({
        version: 1,
        items: Array.from({ length: 300 }, (_, i) => ({
          productId: i === 250 ? "2" : i === 0 ? "1" : "99",
          quantity: 1,
        })),
      })
    );

    results.ab3_to_ab11_domain_storage = {
      ab3_tampered_price: {
        needsRepair: ab3Tampered.needsRepair,
        items: ab3Tampered.items,
        resolvedPriceIqd: ab3Built.lines[0]?.product.priceIqd,
        cartTotalIqd: ab3Built.cartTotalIqd,
      },
      ab4_duplicate_and_max: {
        mergedItems: ab4Merged.items,
        needsRepair: ab4Merged.needsRepair,
        addAt99Ok: ab4AtMax.ok,
        addAt99Reason: ab4AtMax.ok ? null : ab4AtMax.reason,
      },
      ab5_parse_quantity: ab5Results,
      ab6_max_cart_and_neg_zero: {
        maxItemCount: ab6MaxCart.itemCount,
        maxCartTotalIqd: ab6MaxCart.cartTotalIqd,
        maxFormatted: cartMod.formatCartTotalIqd(ab6MaxCart.cartTotalIqd),
        formatZero: cartMod.formatCartTotalIqd(0),
        formatNegZero: ab6NegZeroFormat,
        productsFormatZeroThrows: productsZeroThrows,
      },
      ab7_prototype_pollution: {
        parsedItems: ab7ProtoParsed.items,
        needsRepair: ab7ProtoParsed.needsRepair,
        pollutedOnObjectProto: {}.polluted ?? null,
        rootPollutedOnObjectProto: {}.rootPolluted ?? null,
        protoIdsRejected: ab7ProtoIds,
      },
      ab8_xss_storage: {
        parsedItems: ab8XssParsed.items,
        needsRepair: ab8XssParsed.needsRepair,
        serialized: storageMod.serializeCart(ab8XssParsed.items),
      },
      ab9_serialize_allowlist: ab9Serialized,
      ab10_malformed_and_version: {
        version99: ab10Version99,
        malformed: ab10Malformed,
      },
      ab11_oversized_and_count_cap: {
        oversizedMs: ab11OversizedMs,
        oversizedResult: ab11Oversized,
        many300Result: ab11Many,
      },
    };
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!server.killed) server.kill("SIGKILL");
        resolve();
      }, 3000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    results.server_logs = {
      stdout: stdoutLog.trim(),
      stderr: stderrLog.trim(),
    };
  }

  fs.mkdirSync(ATTACKS_DIR, { recursive: true });
  const outFile = path.join(ATTACKS_DIR, "probe-results.json");
  fs.writeFileSync(outFile, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log("WROTE:", outFile);
  console.log("SERVER_STDERR_EMPTY:", results.server_logs.stderr.length === 0);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
