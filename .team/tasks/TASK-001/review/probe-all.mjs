import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function rawHttpReq(port, method, reqPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: reqPath, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          method,
          path: reqPath,
          status: res.statusCode,
          location: res.headers.location ?? null,
          contentType: res.headers["content-type"] ?? null,
          body: Buffer.concat(chunks).toString("utf8"),
        })
      );
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function waitForServer(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await rawHttpReq(port, "GET", "/");
      if (r.status) return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("timeout");
}

const port = await getFreePort();
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (d) => {
  stderr += d.toString();
});

try {
  await waitForServer(port);

  // 1. All 10 products + all 10 SVGs
  for (let i = 1; i <= 10; i++) {
    const prod = await rawHttpReq(port, "GET", `/products/${i}`);
    const padded = String(i).padStart(2, "0");
    const svg = await rawHttpReq(port, "GET", `/images/products/product-${padded}.svg`);
    const title = prod.body.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null;
    console.log(
      JSON.stringify({
        product: i,
        prodStatus: prod.status,
        title,
        hasSvgRef: prod.body.includes(`/images/products/product-${padded}.svg`),
        hasIqd: prod.body.includes("د.ع"),
        svgStatus: svg.status,
        svgContentType: svg.contentType,
      })
    );
  }

  // 2. Method probes & edge paths
  const extra = [
    ["HEAD", "/products/3", {}],
    ["HEAD", "/products/99", {}],
    ["POST", "/products/3", {}],
    ["POST", "/products/99", {}],
    ["GET", "/products/3?foo=bar", {}],
    ["GET", "/products/03", {}],
    ["GET", "/products/%203", {}],
    ["GET", "/products/3%20", {}],
    ["GET", "/products/3.0", {}],
    ["GET", "/products/%D9%A3", {}],
    ["GET", "/products/99", { Host: "bad host name" }],
    ["GET", "/_next/image?url=%2Fimages%2Fproducts%2Fproduct-01.svg&w=640&q=75", {}],
  ];

  for (const [m, p, h] of extra) {
    const r = await rawHttpReq(port, m, p, h);
    console.log(JSON.stringify({ method: m, path: p, hdr: h, status: r.status, location: r.location }));
  }

  if (stderr.trim()) {
    console.log("SERVER_STDERR:", stderr.trim());
  }
} finally {
  child.kill("SIGTERM");
}
