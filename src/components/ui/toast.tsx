"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
type Ctx = { push: (message: string, tone?: Toast["tone"]) => void };

const ToastCtx = React.createContext<Ctx | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("useToast fora do ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const push = React.useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-[var(--radius)] border px-4 py-3 text-sm shadow-lg",
              t.tone === "success" && "border-green-200 bg-green-50 text-green-900",
              t.tone === "error" && "border-red-200 bg-red-50 text-red-900",
              t.tone === "info" && "border-gray-200 bg-white text-gray-900",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
