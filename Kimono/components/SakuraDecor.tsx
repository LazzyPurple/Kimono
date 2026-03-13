"use client";

import Image from "next/image";
import { createSakuraPetals } from "@/lib/sakura-petals";

const petals = createSakuraPetals();

export default function SakuraDecor() {
  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none z-0 motion-reduce:hidden"
      aria-hidden="true"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes float-petal {
          0% { transform: translateY(-10vh) translateX(0px) rotate(0deg); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.8; }
          100% { transform: translateY(110vh) translateX(120px) rotate(720deg); opacity: 0; }
        }
        @keyframes float-petal-reverse {
          0% { transform: translateY(-10vh) translateX(0px) rotate(0deg); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.8; }
          100% { transform: translateY(110vh) translateX(-120px) rotate(-720deg); opacity: 0; }
        }
      `,
        }}
      />

      {petals.map((petal) => (
        <div
          key={petal.id}
          className="absolute drop-shadow-[0_0_8px_rgba(255,183,197,0.4)] will-change-transform"
          style={{
            left: petal.left,
            animation: `${petal.animationName} ${petal.animationDuration} linear infinite`,
            animationDelay: petal.animationDelay,
            top: "-15px",
            transform: petal.transform,
          }}
        >
          <Image
            src={petal.asset}
            alt="Sakura"
            width={16}
            height={16}
            className="h-full w-full opacity-60"
          />
        </div>
      ))}
    </div>
  );
}
