"use client";

interface PaginationProps {
  current: number;
  total: number;
  onChange: (p: number) => void;
}

export default function Pagination({ current, total, onChange }: PaginationProps) {
  if (total <= 1) return null;

  const pages: (number | "...")[] = [];
  pages.push(1);
  if (current > 3) pages.push("...");
  if (current > 2) pages.push(current - 1);
  if (current > 1 && current < total) pages.push(current);
  if (current < total - 1) pages.push(current + 1);
  if (current < total - 2) pages.push("...");
  if (total > 1) pages.push(total);

  // dédoublonnage
  const deduped = pages.filter(
    (p, i, arr) => p === "..." || arr.indexOf(p) === i
  );

  return (
    <div className="flex items-center justify-center gap-1 flex-wrap pt-2">
      {current > 1 && (
        <>
          <button
            onClick={() => onChange(1)}
            className="w-9 h-9 rounded-lg text-sm border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5] transition-colors cursor-pointer flex items-center justify-center"
          >
            «
          </button>
          <button
            onClick={() => onChange(current - 1)}
            className="w-9 h-9 rounded-lg text-sm border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5] transition-colors cursor-pointer flex items-center justify-center"
          >
            ‹
          </button>
        </>
      )}

      {deduped.map((p, i) =>
        p === "..." ? (
          <span key={`d-${i}`} className="px-2 text-[#6b7280]">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`w-9 h-9 rounded-lg text-sm transition-colors cursor-pointer flex items-center justify-center ${
              p === current
                ? "bg-[#7c3aed] text-white"
                : "border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5]"
            }`}
          >
            {p}
          </button>
        )
      )}

      {current < total && (
        <>
          <button
            onClick={() => onChange(current + 1)}
            className="w-9 h-9 rounded-lg text-sm border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5] transition-colors cursor-pointer flex items-center justify-center"
          >
            ›
          </button>
          <button
            onClick={() => onChange(total)}
            className="w-9 h-9 rounded-lg text-sm border border-[#1e1e2e] text-[#6b7280] hover:bg-[#1e1e2e] hover:text-[#f0f0f5] transition-colors cursor-pointer flex items-center justify-center"
          >
            »
          </button>
        </>
      )}
    </div>
  );
}
