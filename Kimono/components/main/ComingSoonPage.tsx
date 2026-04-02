interface ComingSoonPageProps {
  eyebrow: string;
  title: string;
  description: string;
}

export default function ComingSoonPage({ eyebrow, title, description }: ComingSoonPageProps) {
  return (
    <section className="neo-wrap py-10 sm:py-14">
      <div className="neo-panel mx-auto max-w-4xl p-6 sm:p-10">
        <p className="neo-label mb-4">{eyebrow}</p>
        <h1 className="neo-heading mb-6">{title}</h1>
        <p className="max-w-2xl text-base leading-7 text-[#888888] sm:text-lg">{description}</p>
        <div className="mt-8 inline-flex border-2 border-white bg-[#1a1a1a] px-4 py-3 text-sm font-black uppercase tracking-[0.24em] text-[#888888]">
          Coming soon
        </div>
      </div>
    </section>
  );
}