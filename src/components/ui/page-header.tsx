export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-[var(--color-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
