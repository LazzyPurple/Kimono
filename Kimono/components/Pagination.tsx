"use client";

interface PaginationProps {
  current: number;
  total: number;
  onChange: (p: number) => void;
}

export default function Pagination({ current, total, onChange }: PaginationProps) {
  if (total <= 1) return null;

  const maxPagesToShow = 5;
  let startPage = Math.max(1, current - Math.floor(maxPagesToShow / 2));
  let endPage = startPage + maxPagesToShow - 1;

  if (endPage > total) {
    endPage = total;
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }

  const pages: number[] = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

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

      {pages.map((p) => (
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
      ))}

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
