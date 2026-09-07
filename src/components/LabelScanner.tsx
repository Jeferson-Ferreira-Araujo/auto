"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseExpirationDates, parseProductNameCandidates } from "@/lib/products/label-parse";
import { downscaleToDataUrl } from "@/lib/image/downscale";

export type LabelScanResult = {
  dates: string[]; // ISO aaaa-mm-dd, mais provável primeiro
  names: string[];
  text: string;
  photo?: string; // data URL colorida (reduzida) do quadro capturado
};

export type WizardResult = { photo?: string; names: string[]; dates: string[] };

type Mode = "product" | "expiry";

const COPY: Record<Mode, { capture: string; noRead: string }> = {
  product: {
    capture: "Capturar foto do produto",
    noRead: "Não consegui ler o nome. Você pode digitar na próxima etapa.",
  },
  expiry: {
    capture: "Capturar a validade",
    noRead: "Não consegui ler a data. Tente aproximar e focar na validade — ou digite na próxima etapa.",
  },
};

/**
 * Captura um quadro da câmera (ou uma foto) e lê o texto com OCR — 100% no
 * navegador (tesseract.js, Apache-2.0; modelo pt-BR baixado da CDN na 1ª vez e
 * cacheado). `mode` só muda os textos; a extração devolve nome e data sempre.
 */
export function LabelScanner({ mode, onResult }: { mode: Mode; onResult: (r: LabelScanResult) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workerRef = useRef<any>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      workerRef.current?.terminate?.();
    };
  }, []);

  async function startCamera() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Câmera indisponível neste navegador. Use “Enviar foto” abaixo.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setError("Não foi possível abrir a câmera (permissão negada). Use “Enviar foto” abaixo.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function getWorker() {
    if (workerRef.current) return workerRef.current;
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("por", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
      },
    });
    workerRef.current = worker;
    return worker;
  }

  /** Desenha a fonte num canvas ampliado e em tons de cinza — ajuda o OCR. */
  function preprocess(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
    const scale = Math.min(2, Math.max(1, 1600 / Math.max(w, h)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = g > 145 ? 255 : g < 95 ? 0 : g;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  async function runOcr(canvas: HTMLCanvasElement, photo?: string) {
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const worker = await getWorker();
      const { data } = await worker.recognize(canvas);
      const text: string = data.text ?? "";
      const result: LabelScanResult = {
        dates: parseExpirationDates(text),
        names: parseProductNameCandidates(text),
        text,
        photo,
      };
      const relevant = mode === "expiry" ? result.dates.length : result.names.length;
      if (!relevant) setError(COPY[mode].noRead);
      onResult(result);
    } catch {
      setError("Falha ao processar a imagem. Verifique a conexão (o modelo é baixado na 1ª vez) ou preencha manualmente.");
    } finally {
      setBusy(false);
    }
  }

  function safePhoto(source: CanvasImageSource): string | undefined {
    try {
      return downscaleToDataUrl(source as HTMLVideoElement | HTMLImageElement);
    } catch {
      return undefined;
    }
  }

  function captureFromCamera() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    void runOcr(preprocess(v, v.videoWidth, v.videoHeight), safePhoto(v));
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      void runOcr(preprocess(im, im.naturalWidth, im.naturalHeight), safePhoto(im));
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      setError("Não consegui abrir essa imagem.");
    };
    im.src = url;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[var(--radius)] border bg-black">
        <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
      </div>

      {busy ? (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${Math.max(8, progress)}%` }} />
          </div>
          <p className="text-xs text-[var(--color-muted)]">Lendo… {progress}%</p>
        </div>
      ) : !cameraOn ? (
        <Button type="button" variant="secondary" onClick={startCamera} className="w-full">
          Abrir câmera
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button type="button" onClick={captureFromCamera} className="flex-1">
            {COPY[mode].capture}
          </Button>
          <Button type="button" variant="ghost" onClick={stopCamera}>
            Parar
          </Button>
        </div>
      )}

      <label className="block">
        <span className="sr-only">Enviar foto</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFile}
          disabled={busy}
          className="block w-full text-xs text-[var(--color-muted)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary-soft)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--color-primary)]"
        />
      </label>

      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}

/**
 * Assistente em 2 etapas: (1) foto do produto → nome; (2) foto da validade → data.
 * A validade quase sempre fica longe do nome na embalagem, então são capturas
 * separadas. Cada etapa pode ser pulada e preenchida manualmente depois.
 */
export function LabelScanWizard({ onDone }: { onDone: (r: WizardResult) => void }) {
  const [stage, setStage] = useState<"product" | "expiry">("product");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [names, setNames] = useState<string[]>([]);

  function afterProduct(r: LabelScanResult) {
    if (r.photo) setPhoto(r.photo);
    setNames(r.names);
    setStage("expiry");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        <span className={stage === "product" ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}>
          1 · Foto do produto
        </span>
        <span className="text-[var(--color-border)]">›</span>
        <span className={stage === "expiry" ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}>
          2 · Foto da validade
        </span>
      </div>

      {stage === "product" ? (
        <>
          <p className="text-sm text-[var(--color-muted)]">
            Fotografe a frente do produto. A AUTORA guarda essa foto e tenta ler o nome.
          </p>
          <LabelScanner mode="product" onResult={afterProduct} />
          <button
            type="button"
            onClick={() => setStage("expiry")}
            className="text-xs font-medium text-[var(--color-primary)]"
          >
            Pular — vou digitar o nome
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--color-muted)]">
            Agora fotografe a <span className="font-medium">data de validade</span> (fundo, tampa ou lateral da embalagem).
          </p>
          <LabelScanner mode="expiry" onResult={(r) => onDone({ photo, names, dates: r.dates })} />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStage("product")}
              className="text-xs font-medium text-[var(--color-muted)]"
            >
              ‹ Voltar
            </button>
            <button
              type="button"
              onClick={() => onDone({ photo, names, dates: [] })}
              className="text-xs font-medium text-[var(--color-primary)]"
            >
              Pular — vou digitar a data
            </button>
          </div>
        </>
      )}
    </div>
  );
}
