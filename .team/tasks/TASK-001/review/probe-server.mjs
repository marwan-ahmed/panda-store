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

function rawHttpGet(port, reqPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "GET",
        path: reqPath,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            path: reqPath,
            status: res.statusCode,
            location: res.headers.location ?? null,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

async function waitForServer(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await rawHttpGet(port, "/");
      if (res.status) return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("Server failed to start in time");
}

const port = await getFreePort();
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
  { stdio: ["ignore", "pipe", "pipe"] }
);

let stderr = "";
child.stderr.on("data", (d) => {
  stderr += d.toString();
});

try {
  await waitForServer(port);

  const probes = [
    ["/", {}],
    ["/products", {}],
    ["/products/", {}],
    ["/products/1", {}],
    ["/products/3", {}],
    ["/products/3/", {}],
    ["/products/%33", {}],
    ["/products/10", {}],
    ["/products/99", {}],
    ["/products/0", {}],
    ["/products/-1", {}],
    ["/products/%20", {}],
    ["/products/%E0%A4%A", {}],
    ["/products/1/extra", {}],
    ["/products/..%2F..%2Flayout", {}],
    ["/products/__proto__", {}],
    ["/products/constructor", {}],
    ["/products/toString", {}],
    ["/products/%3Cscript%3Ealert(1)%3C%2Fscript%3E", {}],
    ["/products/99?next=https://evil.example", {}],
    ["/products/99", { Host: "evil.example", "X-Forwarded-Host": "evil.example" }],
    ["/products/99", { RSC: "1" }],
    ["/products/3", { RSC: "1" }],
    ["/unknown-page", {}],
    ["/__not-found", {}],
    ["/images/products/product-01.svg", {}],
  ];

  for (const [reqPath, hdrs] of probes) {
    const res = await rawHttpGet(port, reqPath, hdrs);
    const titleMatch = res.body.match(/<title>([^<]*)<\/title>/i);
    const hasNotFoundText = res.body.includes("المنتج غير موجود");
    const hasHomeTitle = res.body.includes("باندا ستور");
    const hasPlaceholder = res.body.includes("المتجر قيد البناء");
    const hasStackLeak = /node_modules|D:\\|NEXT_NOT_FOUND|Error:/i.test(res.body);
    const hasScriptPayload = res.body.includes("<script>alert(1)</script>");
    console.log(
      JSON.stringify({
        reqPath,
        reqHeaders: Object.keys(hdrs).length ? hdrs : undefined,
        status: res.status,
        location: res.location,
        contentType: res.headers["content-type"],
        setCookie: res.headers["set-cookie"] ?? null,
        title: titleMatch?.[1] ?? null,
        hasNotFoundText,
        hasHomeTitle,
        hasPlaceholder,
        hasStackLeak,
        hasScriptPayload,
        bodyLen: res.body.length,
      })
    );
  }
  if (stderr.trim()) {
    console.log("STDERR:", stderr.trim());
  }
} finally {
  child.kill("SIGTERM");
}
