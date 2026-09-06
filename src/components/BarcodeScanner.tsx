"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";

const HINTS = new Map([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E],
  ],
]);

/**
 * Leitura de código de barras (EAN/UPC) pela câmera — 100% no navegador (@zxing/library, MIT).
 * Sempre oferece o campo manual como alternativa (câmera bloqueada, sem HTTPS, sem câmera).
 */
export function BarcodeScanner({ onDetect }: { onDetect: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    return () => {
      readerRef.current?.reset();
    };
  }, []);

  async function start() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este dispositivo/navegador não permite usar a câmera aqui. Digite o código abaixo.");
      return;
    }
    try {
      const reader = new BrowserMultiFormatReader(HINTS);
      readerRef.current = reader;
      setScanning(true);
      await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (result) => {
          if (result) {
            const text = result.getText().replace(/\D/g, "");
            if (text.length >= 8) {
              reader.reset();
              setScanning(false);
              onDetect(text);
            }
          }
        },
      );
    } catch {
      setScanning(false);
      setError("Não foi possível abrir a câmera (permissão negada ou indisponível). Digite o código abaixo.");
    }
  }

  function stop() {
    readerRef.current?.reset();
    setScanning(false);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[var(--radius)] border bg-black">
        <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
      </div>

      {!scanning ? (
        <Button type="button" variant="secondary" onClick={start} className="w-full">
          Abrir câmera para escanear
        </Button>
      ) : (
        <Button type="button" variant="ghost" onClick={stop} className="w-full">
          Parar câmera
        </Button>
      )}

      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}

      <div className="flex gap-2">
        <Input
          inputMode="numeric"
          placeholder="Ou digite o código de barras"
          value={manual}
          onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
        />
        <Button
          type="button"
          disabled={manual.length < 8}
          onClick={() => {
            stop();
            onDetect(manual);
          }}
        >
          Usar
        </Button>
      </div>
    </div>
  );
}
