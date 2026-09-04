export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-sm font-bold text-white">
              A
            </span>
            <span className="text-xl font-extrabold tracking-tight text-[var(--color-primary)]">AUTOMIDIA</span>
          </div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Publicações no Instagram no piloto automático</p>
        </div>
        {children}
      </div>
    </div>
  );
}
