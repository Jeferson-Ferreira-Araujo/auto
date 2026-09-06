import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={36} wordmarkClassName="text-xl" />
          <p className="mt-2 text-sm text-[var(--color-muted)]">Seu negócio no automático.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
