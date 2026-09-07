import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // HSTS: só tem efeito em HTTPS (produção). 2 anos + preload.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // A câmera é usada pelo leitor de código de barras / OCR de rótulo (só na própria origem).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), browsing-topics=()" },
  // CSP fica de fora por enquanto — precisa de ajuste fino (Next inline scripts,
  // worker/wasm do tesseract.js, redirect do R2) e teste em preview deploy.
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
