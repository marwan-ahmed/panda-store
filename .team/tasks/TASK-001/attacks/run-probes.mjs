import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const ROOT = process.cwd();
const HOST = "127.0.0.1";
const PORT = 3000;
const ATTACKS_DIR = path.join(ROOT, ".team", "tasks", "TASK-001", "attacks");

function rawRequest({
  method = "GET",
  reqPath = "/",
  headers = {},
  body = null,
}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        method,
        path: reqPath,
        headers: { Connection: "close", ...headers },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            method,
            path: reqPath,
            requestHeaders: headers,
            status: res.statusCode ?? 0,
            headers: res.headers,
            bodyLength: Buffer.byteLength(text, "utf8"),
            body: text,
          });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error(`Request timeout for ${method} ${reqPath}`));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await rawRequest({ reqPath: "/" });
      if (res.status === 200) return;
    } catch {
      // Server still starting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Timed out waiting for next start on 127.0.0.1:3000");
}

function summarizeResponse(res, maxBody = 400) {
  return {
    method: res.method,
    path: res.path,
    requestHeaders: res.requestHeaders,
    status: res.status,
    headers: {
      "content-type": res.headers["content-type"] ?? null,
      location: res.headers["location"] ?? null,
      "set-cookie": res.headers["set-cookie"] ?? null,
      "cache-control": res.headers["cache-control"] ?? null,
      "access-control-allow-origin": res.headers["access-control-allow-origin"] ?? null,
      "x-content-type-options": res.headers["x-content-type-options"] ?? null,
      "content-security-policy": res.headers["content-security-policy"] ?? null,
      "x-frame-options": res.headers["x-frame-options"] ?? null,
      "referrer-policy": res.headers["referrer-policy"] ?? null,
      "permissions-policy": res.headers["permissions-policy"] ?? null,
      "x-powered-by": res.headers["x-powered-by"] ?? null,
      "x-nextjs-cache": res.headers["x-nextjs-cache"] ?? null,
      "x-custom-attack": res.headers["x-custom-attack"] ?? null,
    },
    bodyLength: res.bodyLength,
    hasNotFoundArabic: res.body.includes("المنتج غير موجود"),
    hasStoreHeading: res.body.includes("باندا ستور"),
    hasBackLink: res.body.includes('href="/"'),
    bodyExcerpt: res.body.slice(0, maxBody).replace(/\s+/g, " "),
  };
}

function stopProcessTree(child) {
  if (!child || child.pid == null) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], {
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    // ignore cleanup errors
  }
}

async function run() {
  fs.mkdirSync(ATTACKS_DIR, { recursive: true });
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const serverLogs = [];
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT), "-H", HOST], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (d) => serverLogs.push(d.toString("utf8")));
  server.stderr.on("data", (d) => serverLogs.push(d.toString("utf8")));

  try {
    await waitForServer();

    const results = {
      timestamp: new Date().toISOString(),
      target: `http://${HOST}:${PORT}`,
      ab1_access_control_routes: [],
      ab2_no_mutations_or_commerce: [],
      ab3_no_authentication: [],
      ab4_ab5_pricing_and_catalog: [],
      ab6_prototype_keys: [],
      ab7_xss_and_encoding: [],
      ab8_svg_and_next_image: [],
      ab9_data_exposure_and_rsc: {},
      ab10_resource_abuse_burst: {},
      ab11_config_headers_host_bundle: {},
    };

    // AB-1: routing & 404 verification
    const ab1Paths = [
      "/",
      ...Array.from({ length: 10 }, (_, i) => `/products/${i + 1}`),
      "/products",
      "/products/",
      "/products/3/",
      "/products/%33",
      "/products/03",
      "/products/%203%20",
      "/products/99",
      "/products/0",
      "/products/-1",
      "/products/%20",
      "/products/1/extra",
      "/products/..%2F..%2Flayout",
      "/products/%2e%2e%2f",
      "/products/../../layout",
      "/__not-found",
      "/nonexistent-page",
    ];
    for (const p of ab1Paths) {
      const res = await rawRequest({ reqPath: p });
      results.ab1_access_control_routes.push(summarizeResponse(res));
    }
    results.ab1_access_control_routes.push(
      summarizeResponse(
        await rawRequest({
          reqPath: "/products/99",
          headers: { RSC: "1", "Next-Router-Prefetch": "1" },
        })
      )
    );
    results.ab1_access_control_routes.push(
      summarizeResponse(
        await rawRequest({
          reqPath: "/products/3?_rsc=probe",
          headers: { RSC: "1" },
        })
      )
    );

    // AB-2: APIs, Server Actions, cart/checkout/admin
    for (const probe of [
      { method: "POST", reqPath: "/", headers: { "Next-Action": "deadbeef01234567", "Content-Type": "text/plain" }, body: "[]" },
      { method: "POST", reqPath: "/products/3", headers: { "Next-Action": "deadbeef01234567", "Content-Type": "text/plain" }, body: "[]" },
      { method: "GET", reqPath: "/api/products" },
      { method: "POST", reqPath: "/api/cart", headers: { "Content-Type": "application/json" }, body: '{"id":"1"}' },
      { method: "POST", reqPath: "/api/upload", headers: { "Content-Type": "application/json" }, body: '{"file":"x"}' },
      { method: "GET", reqPath: "/cart" },
      { method: "GET", reqPath: "/checkout" },
      { method: "GET", reqPath: "/admin" },
    ]) {
      results.ab2_no_mutations_or_commerce.push(summarizeResponse(await rawRequest(probe)));
    }
    const homeHtml = (await rawRequest({ reqPath: "/" })).body;
    const prod3Html = (await rawRequest({ reqPath: "/products/3" })).body;
    const notFoundIdxHome = homeHtml.indexOf("المنتج غير موجود");
    const notFoundIdxProd3 = prod3Html.indexOf("المنتج غير موجود");
    results.ab2_dom_checks = {
      homeHasFormOrInput: /<(form|input|button[^>]*type=["']submit)/i.test(homeHtml),
      homeHasCommerceWords: /سلة|إتمام الطلب|دفع عند الاستلام|الدفع الإلكتروني|تسجيل الدخول|خصم|تخفيض|ضريبة|توصيل/.test(homeHtml),
      homeCardCount: (homeHtml.match(/<article\b/g) ?? []).length,
      homeHtmlRtlAr: /<html[^>]*\blang="ar"[^>]*\bdir="rtl"/.test(homeHtml),
      prod3HasFormOrInput: /<(form|input|button[^>]*type=["']submit)/i.test(prod3Html),
      homeNotFoundStringContext: notFoundIdxHome >= 0 ? homeHtml.slice(Math.max(0, notFoundIdxHome - 120), notFoundIdxHome + 160) : null,
      prod3NotFoundStringContext: notFoundIdxProd3 >= 0 ? prod3Html.slice(Math.max(0, notFoundIdxProd3 - 120), notFoundIdxProd3 + 160) : null,
    };

    // AB-3: authentication & Set-Cookie
    for (const probe of [
      { reqPath: "/login" },
      { reqPath: "/signup" },
      { reqPath: "/account" },
      { reqPath: "/api/auth/session" },
      {
        reqPath: "/products/3",
        headers: {
          Cookie: "session=forged-admin",
          Authorization: "Bearer forged-token",
          "X-User-Role": "admin",
        },
      },
      {
        reqPath: "/products/99",
        headers: {
          Cookie: "session=forged-admin",
          Authorization: "Bearer forged-token",
          "X-User-Role": "admin",
        },
      },
    ]) {
      results.ab3_no_authentication.push(summarizeResponse(await rawRequest(probe)));
    }

    // AB-4 & AB-5: pricing & catalog HTML checks
    const expectedPrices = [
      "15,000 د.ع",
      "9,500 د.ع",
      "18,000 د.ع",
      "28,000 د.ع",
      "22,000 د.ع",
      "25,000 د.ع",
      "12,000 د.ع",
      "34,000 د.ع",
      "7,500 د.ع",
      "30,000 د.ع",
    ];
    results.ab4_ab5_pricing_and_catalog = {
      homeHasAll10Prices: expectedPrices.every((p) => homeHtml.includes(p)),
      homeHasDecimalIqd: /\d+\.\d+\s*د\.ع/.test(homeHtml),
      homeHasDelOrStrikeTag: /<(del|s)\b/i.test(homeHtml),
      homeHasDiscountOrTaxWords: /خصم|تخفيض|السعر السابق|بدلاً من|ضريبة|توصيل|شحن/.test(homeHtml),
      detailPagesVerified: [],
    };
    for (let i = 1; i <= 10; i += 1) {
      const r = await rawRequest({ reqPath: `/products/${i}` });
      results.ab4_ab5_pricing_and_catalog.detailPagesVerified.push({
        id: String(i),
        status: r.status,
        hasExpectedPrice: r.body.includes(expectedPrices[i - 1]),
        hasDecimalIqd: /\d+\.\d+\s*د\.ع/.test(r.body),
      });
    }

    // AB-6: prototype property keys
    for (const key of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty", "__defineGetter__"]) {
      const r = await rawRequest({ reqPath: `/products/${key}` });
      const sum = summarizeResponse(r);
      sum.leaksObjectOrFunction = /\[object Object\]|function\s+\w+\(\)/.test(r.body);
      results.ab6_prototype_keys.push(sum);
    }

    // AB-7: XSS & malformed percent-encoding
    for (const p of [
      "/products/<script>alert(1)</script>",
      "/products/%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      "/products/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E",
      "/products/%E0%A4%A",
      "/products/%",
      "/products/3?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      "/products/99?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    ]) {
      const r = await rawRequest({ reqPath: p });
      const sum = summarizeResponse(r);
      sum.reflectsAlertPayload = /<script>alert\(1\)|onerror=alert|alert\(1\)/i.test(r.body);
      sum.leaksUriErrorOrStack = /URIError|decodeURIComponent|node_modules|D:\\/i.test(r.body);
      results.ab7_xss_and_encoding.push(sum);
    }

    // AB-8: SVG files & /_next/image
    for (let i = 1; i <= 10; i += 1) {
      const p = `/images/products/product-${String(i).padStart(2, "0")}.svg`;
      const r = await rawRequest({ reqPath: p });
      const withoutNs = r.body.replace(
        /(<svg\b[^>]*?)\s+xmlns=(["'])http:\/\/www\.w3\.org\/2000\/svg\2/i,
        "$1"
      );
      results.ab8_svg_and_next_image.push({
        path: p,
        status: r.status,
        contentType: r.headers["content-type"] ?? null,
        xContentTypeOptions: r.headers["x-content-type-options"] ?? null,
        csp: r.headers["content-security-policy"] ?? null,
        byteLength: r.bodyLength,
        hasScriptOrEventOrForeignObject: /<script\b|\son[a-z]+\s*=|<foreignObject\b|javascript:/i.test(r.body),
        hasExternalHttpAfterRootNs: /https?:\/\//i.test(withoutNs),
      });
    }
    const nextImgSvg = await rawRequest({
      reqPath: "/_next/image?url=%2Fimages%2Fproducts%2Fproduct-01.svg&w=640&q=75",
    });
    results.ab8_next_image_svg_block = summarizeResponse(nextImgSvg);

    // AB-9: data exposure & RSC payload inspection
    const rscProd3 = await rawRequest({ reqPath: "/products/3?_rsc=probe", headers: { RSC: "1" } });
    const notFound99 = await rawRequest({ reqPath: "/products/99" });
    results.ab9_data_exposure_and_rsc = {
      homeLeaksInternalPaths: /ajeeb-app|node_modules|D:\\|C:\\Users/i.test(homeHtml),
      prod3LeaksInternalPaths: /ajeeb-app|node_modules|D:\\|C:\\Users/i.test(prod3Html),
      notFound99LeaksInternalPaths: /ajeeb-app|node_modules|D:\\|C:\\Users|Error:|at\s+\w+\s*\(/i.test(notFound99.body),
      rscProd3Status: rscProd3.status,
      rscProd3HasAdminOrDiscount: /adminNote|discountPercent|previousPrice/i.test(rscProd3.body),
      rscProd3BodyLength: rscProd3.bodyLength,
      rscProd3Body: rscProd3.body.slice(0, 1200),
    };

    // AB-10: resource abuse, query carryover, 50-req burst
    const deepPath = "/products/1/a/b/c/d/e/f/g/h/i/j/k";
    const oversizedId = `/products/${"a".repeat(4096)}`;
    const queryAttack = "/products/99?next=https://evil.example&foo=bar";
    const ab10Single = [];
    for (const p of [deepPath, oversizedId, queryAttack]) {
      const r = await rawRequest({ reqPath: p });
      const sum = summarizeResponse(r);
      sum.pathLength = p.length;
      sum.reflectsEvilExample = r.body.includes("evil.example") || JSON.stringify(r.headers).includes("evil.example");
      ab10Single.push(sum);
    }
    const burstStart = Date.now();
    const burstStatuses = {};
    for (let i = 0; i < 50; i += 1) {
      const r = await rawRequest({ reqPath: `/products/invalid-${i}` });
      burstStatuses[r.status] = (burstStatuses[r.status] ?? 0) + 1;
    }
    const burstElapsedMs = Date.now() - burstStart;
    const uploadAttempt = summarizeResponse(
      await rawRequest({
        method: "POST",
        reqPath: "/api/upload",
        headers: { "Content-Type": "multipart/form-data; boundary=----test" },
        body: "------test--\r\n",
      })
    );
    results.ab10_resource_abuse_burst = {
      probes: ab10Single,
      burst50: { elapsedMs: burstElapsedMs, statusCounts: burstStatuses },
      uploadAttempt,
    };

    // AB-11: Host header injection, Origin CORS check, trailing slash redirects, security headers, client chunks
    const hostHeaderProbes = [];
    for (const p of ["/products/99", "/products/3", "/products/", "/products/3/"]) {
      const r = await rawRequest({
        reqPath: p,
        headers: {
          Host: "evil.example",
          "X-Forwarded-Host": "evil.example",
          Origin: "https://evil.example",
          "X-Custom-Attack": "injected-value",
        },
      });
      const sum = summarizeResponse(r);
      sum.reflectsEvilHostInHeaders = JSON.stringify(r.headers).includes("evil.example");
      sum.reflectsEvilHostInBody = r.body.includes("evil.example");
      hostHeaderProbes.push(sum);
    }

    const chunkDir = path.join(ROOT, ".next", "static", "chunks");
    const chunkFiles = fs.existsSync(chunkDir)
      ? fs.readdirSync(chunkDir).filter((f) => f.endsWith(".js"))
      : [];
    const chunkFindings = [];
    for (const f of chunkFiles) {
      const content = fs.readFileSync(path.join(chunkDir, f), "utf8");
      if (/sk_live_|pk_live_|NEXT_PUBLIC_|ajeeb-app|D:\\\\|evil\.example/.test(content)) {
        chunkFindings.push(f);
      }
    }

    results.ab11_config_headers_host_bundle = {
      hostHeaderProbes,
      rootHeaders: summarizeResponse(await rawRequest({ reqPath: "/" })).headers,
      prod3Headers: summarizeResponse(await rawRequest({ reqPath: "/products/3" })).headers,
      notFound99Headers: summarizeResponse(await rawRequest({ reqPath: "/products/99" })).headers,
      svgHeaders: summarizeResponse(await rawRequest({ reqPath: "/images/products/product-01.svg" })).headers,
      compiledClientChunksChecked: chunkFiles.length,
      chunksWithSensitiveMatches: chunkFindings,
    };

    results.serverLogsTail = serverLogs.join("").slice(-1500);

    fs.writeFileSync(
      path.join(ATTACKS_DIR, "probe-results.json"),
      JSON.stringify(results, null, 2),
      "utf8"
    );
    console.log("PROBES_COMPLETED_OK");
  } finally {
    stopProcessTree(server);
    http.globalAgent.destroy();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
