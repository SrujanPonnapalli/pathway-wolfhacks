import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let a device on the same network (the Raspberry Pi kiosk) load the dev server by this
  // machine's LAN address: Next blocks dev-only assets from other hostnames otherwise.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
};

export default nextConfig;
