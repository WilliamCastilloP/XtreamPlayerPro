/**
 * Print the LAN URL for phone testing and try to open Windows firewall
 * ports for Next (3000) and the stream proxy (8080).
 *
 * Usage: npm run lan:ready
 */
import os from "os";
import { execSync } from "child_process";

const NEXT_PORT = Number(process.env.PORT || 3000);
const PROXY_PORT = Number(process.env.STREAM_PROXY_PORT || 8080);

function lanIPv4() {
  const preferred = [];
  const others = [];
  for (const [name, nets] of Object.entries(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family !== "IPv4" || net.internal) continue;
      const row = { name, address: net.address };
      if (/wi-?fi|wlan|wireless|ethernet|eth/i.test(name)) preferred.push(row);
      else others.push(row);
    }
  }
  return [...preferred, ...others];
}

function ensureFirewallRule(name, port) {
  if (process.platform !== "win32") {
    console.log(`[lan-ready] skip firewall (${process.platform}): allow TCP ${port} manually`);
    return false;
  }
  try {
    const existing = execSync(
      `netsh advfirewall firewall show rule name="${name}"`,
      { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" },
    );
    if (existing && existing.includes(name)) {
      console.log(`[lan-ready] firewall OK · ${name}`);
      return true;
    }
  } catch {
    /* rule missing */
  }

  const cmd = `netsh advfirewall firewall add rule name="${name}" dir=in action=allow protocol=TCP localport=${port}`;
  try {
    execSync(cmd, { stdio: "inherit" });
    console.log(`[lan-ready] firewall added · ${name} (TCP ${port})`);
    return true;
  } catch {
    console.log(`[lan-ready] could not add firewall rule (run PowerShell as Administrator):`);
    console.log(`  ${cmd}`);
    return false;
  }
}

async function checkProxy(ip) {
  const urls = [
    `http://127.0.0.1:${PROXY_PORT}/health`,
    ip ? `http://${ip}:${PROXY_PORT}/health` : null,
  ].filter(Boolean);

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[lan-ready] proxy health OK · ${url}`);
        if (json.ffmpeg != null) {
          console.log(`[lan-ready] ffmpeg: ${json.ffmpeg ? "ok" : "missing"}`);
        }
        return true;
      }
      console.log(`[lan-ready] proxy health ${res.status} · ${url}`);
    } catch (err) {
      console.log(
        `[lan-ready] proxy unreachable · ${url} · ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return false;
}

const addrs = lanIPv4();
const primary = addrs[0]?.address || null;

console.log("");
console.log("=== XtreamPlayerPro · LAN phone access ===");
console.log("");
console.log("1) Same Wi‑Fi / hotspot as this PC");
console.log("2) Terminal A:  npm run proxy");
console.log("3) Terminal B:  npm run dev     (binds 0.0.0.0)");
console.log("4) On the phone open the URL below — NOT localhost");
console.log("");

if (!addrs.length) {
  console.log("[lan-ready] no LAN IPv4 found. Connect Wi‑Fi/Ethernet and retry.");
  process.exitCode = 1;
} else {
  console.log("LAN addresses on this PC:");
  for (const a of addrs) {
    console.log(`  · ${a.address}  (${a.name})`);
  }
  console.log("");
  console.log(`>>> Phone URL:  http://${primary}:${NEXT_PORT}`);
  console.log(`>>> Proxy:      http://${primary}:${PROXY_PORT}/health`);
  console.log("");
  console.log(
    "Keep NEXT_PUBLIC_STREAM_PROXY_BASE=http://127.0.0.1:8080 — the app rewrites it to your LAN IP on the phone.",
  );
}

console.log("");
ensureFirewallRule("XtreamPlayerPro Dev 3000", NEXT_PORT);
ensureFirewallRule("XtreamPlayerPro Proxy 8080", PROXY_PORT);
console.log("");

const ok = await checkProxy(primary);
if (!ok) {
  console.log("[lan-ready] start the proxy in another terminal: npm run proxy");
  console.log("");
  process.exitCode = 1;
} else {
  console.log("");
  console.log("Ready. Restart npm run dev if it was already running.");
  console.log("");
}
