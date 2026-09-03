import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("rounded-[var(--radius)] border bg-[var(--color-surface)] shadow-sm", className)}
    {...props}
  />
);

export const CardBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-5", className)} {...props} />
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[var(--radius)] border bg-white px-3 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-24 w-full rounded-[var(--radius)] border bg-white px-3 py-2 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 w-full rounded-[var(--radius)] border bg-white px-3 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("mb-1.5 block text-sm font-medium text-[var(--color-text)]", className)} {...props} />
);

export const Field = ({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="mb-4">
    <Label>{label}</Label>
    {children}
    {hint && !error && <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>}
    {error && <p className="mt-1 text-xs text-[var(--color-danger)]">{error}</p>}
  </div>
);

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";
const toneMap: Record<Tone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
  primary: "bg-violet-100 text-violet-800",
};

export const Badge = ({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) => (
  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", toneMap[tone])}>
    {children}
  </span>
);

export const EmptyState = ({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed bg-[var(--color-surface)] px-6 py-14 text-center">
    {icon && <div className="mb-3 text-4xl">{icon}</div>}
    <h3 className="text-base font-semibold">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-sm text-[var(--color-muted)]">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
