const SAKURA_ASSETS = [
  "/assets/1month_36px.svg",
  "/assets/2month_36px.svg",
  "/assets/3month_36px.svg",
  "/assets/6month_36px.svg",
  "/assets/9month_36px.svg",
  "/assets/12month_36px.svg",
] as const;

export interface SakuraPetal {
  id: number;
  asset: (typeof SAKURA_ASSETS)[number];
  left: string;
  animationDuration: string;
  animationDelay: string;
  animationName: "float-petal" | "float-petal-reverse";
  transform: string;
}

function getSeed(index: number, salt: number): number {
  const seeded = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return seeded - Math.floor(seeded);
}

export function createSakuraPetals(count = 24): SakuraPetal[] {
  return Array.from({ length: count }, (_, index) => {
    const assetIndex = Math.min(
      SAKURA_ASSETS.length - 1,
      Math.floor(getSeed(index, 1) * SAKURA_ASSETS.length)
    );
    const left = -5 + getSeed(index, 2) * 110;
    const duration = 16 + getSeed(index, 3) * 20;
    const delay = -(getSeed(index, 4) * 30);
    const scale = 0.2 + getSeed(index, 5) * 0.35;

    return {
      id: index,
      asset: SAKURA_ASSETS[assetIndex],
      left: `${left.toFixed(4)}%`,
      animationDuration: `${duration.toFixed(4)}s`,
      animationDelay: `${delay.toFixed(4)}s`,
      animationName:
        getSeed(index, 6) > 0.5 ? "float-petal-reverse" : "float-petal",
      transform: `scale(${scale.toFixed(4)})`,
    };
  });
}
