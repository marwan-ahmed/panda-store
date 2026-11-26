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
    const req = http.request({ host: "127.0.0.1", port, method: "GET", path: reqPath, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForServer(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await rawHttpGet(port, "/");
      if (r.status) return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("timeout");
}

const port = await getFreePort();
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: "ignore",
});

try {
  await waitForServer(port);
  for (const p of ["/", "/products/3", "/products/99"]) {
    const res = await rawHttpGet(port, p);
    const bodyMatch = res.body.match(/<body[^>]*>([\s\S]*?)<script/i);
    console.log(`=== BODY ${p} (${res.status}) ===`);
    console.log(bodyMatch?.[1]?.slice(0, 4000));
  }
  for (const [p, h] of [
    ["/products/", {}],
    ["/products/", { Host: "evil.example", "X-Forwarded-Host": "evil.example" }],
    ["/products///", {}],
    ["/products/1/", {}],
    ["/products/99/", {}],
    ["/products/%2F", {}],
    ["/products/%00", {}],
    ["/products/3?_rsc=1", { RSC: "1" }],
    ["/products/99?_rsc=1", { RSC: "1" }],
  ]) {
    const res = await rawHttpGet(port, p, h);
    console.log(JSON.stringify({ p, h, status: res.status, location: res.headers.location ?? null, body: res.body.slice(0, 120) }));
  }
} finally {
  child.kill("SIGTERM");
}
