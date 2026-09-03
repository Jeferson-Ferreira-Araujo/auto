export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-48 rounded bg-black/10" />
      <div className="h-24 rounded-[var(--radius)] bg-black/5" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-[var(--radius)] bg-black/5" />
        ))}
      </div>
    </div>
  );
}
