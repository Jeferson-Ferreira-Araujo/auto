import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp e ffprobe-static usam binários nativos — não devem ser empacotados pelo bundler.
  serverExternalPackages: ["sharp", "ffprobe-static", "pino"],
  // Só o binário linux (a Vercel roda linux) — evita empacotar darwin+win32 (~220 MB extras
  // por função) e estourar o limite de Function Storage do plano Hobby.
  // Só a rota que roda ffprobe (recebe vídeo do WhatsApp). As Server Actions de
  // upload (/biblioteca) já são rastreadas automaticamente pelo require de ffprobe-static.
  outputFileTracingIncludes: {
    "/api/whatsapp": ["./node_modules/ffprobe-static/bin/linux/x64/**"],
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
