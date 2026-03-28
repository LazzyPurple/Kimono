interface AdminErrorFallbackProps {
  title?: string;
  message: string;
}

export default function AdminErrorFallback({
  title = "Admin page error",
  message,
}: AdminErrorFallbackProps) {
  return (
    <div className="rounded-[26px] border border-red-500/30 bg-red-500/10 p-6 text-red-100 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-red-300">admin fallback</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      <pre className="mt-4 overflow-x-auto rounded-2xl border border-red-500/20 bg-[#09090f] p-4 text-sm leading-6 text-red-100">
        {message}
      </pre>
    </div>
  );
}
