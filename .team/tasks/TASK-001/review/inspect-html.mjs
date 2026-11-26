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

function rawHttpGet(port, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "GET", path: reqPath }, (res) => {
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
    console.log(`=== ${p} (${res.status}) ===`);
    // Check html tag, head, and visible body before Next.js RSC script tags
    const htmlTag = res.body.match(/<html[^>]*>/i)?.[0];
    const headMatch = res.body.match(/<head>[\s\S]*?<\/head>/i)?.[0];
    const bodyVisible = res.body.split(/<script/)[0];
    const externalUrls = res.body.match(/https?:\/\/[^\s"'<>\\]+/gi) ?? [];
    console.log("htmlTag:", htmlTag);
    console.log("head:", headMatch);
    console.log("bodyBeforeScripts:", bodyVisible);
    console.log("externalUrlsInHtml:", [...new Set(externalUrls)]);
  }
} finally {
  child.kill("SIGTERM");
}
