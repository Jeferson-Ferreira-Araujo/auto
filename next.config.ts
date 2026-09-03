import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp e ffprobe-static usam binários nativos — não devem ser empacotados pelo bundler.
  serverExternalPackages: ["sharp", "ffprobe-static", "pino", "pino-pretty"],
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/ffprobe-static/bin/**"],
  },
};

export default nextConfig;
