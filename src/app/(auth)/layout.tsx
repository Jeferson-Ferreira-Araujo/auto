import { AuthBrandPanel } from "./BrandPanel";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AuthBrandPanel />
      <div className="flex flex-1 items-start justify-center bg-[var(--color-bg)] px-4 pb-10 pt-10 sm:pt-14 lg:items-center lg:pt-0">
        <div className="w-full max-w-sm animate-auth-in">{children}</div>
      </div>
    </div>
  );
}
