import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp e ffprobe-static usam binários nativos — não devem ser empacotados pelo bundler.
  serverExternalPackages: ["sharp", "ffprobe-static", "pino", "pino-pretty"],
  // Só o binário linux (a Vercel roda linux) — evita empacotar darwin+win32 (~220 MB extras
  // por função) e estourar o limite de Function Storage do plano Hobby.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/ffprobe-static/bin/linux/x64/**"],
  },
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/ffprobe-static/bin/darwin/**",
      "./node_modules/ffprobe-static/bin/win32/**",
      "./node_modules/ffprobe-static/bin/linux/ia32/**",
    ],
  },
};

export default nextConfig;
