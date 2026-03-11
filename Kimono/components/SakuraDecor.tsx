"use client";

import { useState } from "react";
import Image from "next/image";

const SAKURA_ASSETS = [
  "/assets/1month_36px.svg",
  "/assets/2month_36px.svg",
  "/assets/3month_36px.svg",
  "/assets/6month_36px.svg",
  "/assets/9month_36px.svg",
  "/assets/12month_36px.svg",
];

interface Petal {
  id: number;
  asset: string;
  left: string;
  animationDuration: string;
  animationDelay: string;
  animationName: "float-petal" | "float-petal-reverse";
  transform: string;
}

export default function SakuraDecor() {
  const [petals] = useState<Petal[]>(() =>
    Array.from({ length: 24 }, (_, i) => {
      const randomAsset =
        SAKURA_ASSETS[Math.floor(Math.random() * SAKURA_ASSETS.length)];

      return {
        id: i,
        asset: randomAsset,
        left: `${-5 + Math.random() * 110}%`,
        animationDuration: `${16 + Math.random() * 20}s`,
        animationDelay: `-${Math.random() * 30}s`,
        animationName:
          Math.random() > 0.5 ? "float-petal" : "float-petal-reverse",
        transform: `scale(${0.2 + Math.random() * 0.35})`,
      };
    })
  );

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
            className="w-full h-full opacity-60"
          />
        </div>
      ))}
    </div>
  );
}
