import type { NextConfig } from "next";

// Zusätzliche Hostnamen (z. B. LAN-IP fürs iPhone), die den Dev-Server nutzen dürfen.
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs"],
  allowedDevOrigins,
};

export default nextConfig;
