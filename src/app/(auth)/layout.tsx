export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold text-[var(--color-primary)]">InstaPub</div>
          <p className="text-sm text-[var(--color-muted)]">Publicações no Instagram no piloto automático</p>
        </div>
        {children}
      </div>
    </div>
  );
}
