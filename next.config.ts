import type { NextConfig } from "next";
import os from "os";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  fallbacks: {
    document: "/offline",
  },
});

/** IPv4 addresses on this machine (for phone/LAN `next dev` access). */
function lanHosts(): string[] {
  const hosts = new Set<string>();
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === "IPv4" && !net.internal) {
        hosts.add(net.address);
      }
    }
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // next-pwa injects a webpack config; production builds use --webpack.
  turbopack: {},
  // Next 16 blocks cross-origin dev assets unless the LAN host is listed.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...lanHosts(),
    ...(process.env.ALLOWED_DEV_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ],
};

export default withPWA(nextConfig);
