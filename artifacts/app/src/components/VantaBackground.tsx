import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import p5 from "p5";

export type VantaStyle = "off" | "net" | "globe" | "halo" | "cells" | "rings" | "topology";

type VantaRing = { speed: number; userData?: Record<string, unknown> };
type VantaInstance = {
  destroy: () => void;
  resize?: () => void;
  setOptions?: (options: Record<string, unknown>) => void;
  rings?: VantaRing[];
};
type VantaFactory = (options: Record<string, unknown>) => VantaInstance;
type VantaModule = { default?: VantaFactory | { default?: VantaFactory }; [key: string]: unknown };
function factoryFrom(module: VantaModule): VantaFactory {
  const candidate = typeof module.default === "function" ? module.default : module.default?.default;
  if (typeof candidate !== "function") throw new Error("Vanta effect did not expose an initializer");
  return candidate;
}

async function loadFactory(style: Exclude<VantaStyle, "off">): Promise<VantaFactory> {
  switch (style) {
    case "net": return factoryFrom(await import("vanta/dist/vanta.net.min.js"));
    case "globe": return factoryFrom(await import("vanta/dist/vanta.globe.min.js"));
    case "halo": return factoryFrom(await import("vanta/dist/vanta.halo.min.js"));
    case "cells": return factoryFrom(await import("vanta/dist/vanta.cells.min.js"));
    case "rings": return factoryFrom(await import("vanta/dist/vanta.rings.min.js"));
    case "topology": return factoryFrom(await import("vanta/dist/vanta.topology.min.js"));
  }
}

const EFFECT_OPTIONS: Record<Exclude<VantaStyle, "off">, Record<string, unknown>> = {
  net: { color: 0x22c55e, backgroundColor: 0x07110b, points: 10, maxDistance: 22, spacing: 18 },
  globe: { color: 0x16a34a, color2: 0x60a5fa, backgroundColor: 0x070b12, size: 0.9 },
  halo: { baseColor: 0x16a34a, backgroundColor: 0x070b12, amplitudeFactor: 1.1, xOffset: 0.18, size: 1.2 },
  cells: { color1: 0x34d399, color2: 0x60a5fa, backgroundColor: 0xf4fbf7, size: 1.35, speed: 0.75 },
  rings: { color: 0x22c55e, backgroundColor: 0x070b12, backgroundAlpha: 0.35 },
  topology: { color: 0x15803d, backgroundColor: 0xf6faf7 },
};

function applyIntensity(instance: VantaInstance, style: VantaStyle, intensity: number) {
  instance.setOptions?.({ speed: intensity });
  if (style !== "rings") return;
  for (const ring of instance.rings ?? []) {
    ring.userData ??= {};
    const savedSpeed = ring.userData.schoolarBaseSpeed;
    const baseSpeed = typeof savedSpeed === "number" ? savedSpeed : ring.speed;
    ring.userData.schoolarBaseSpeed = baseSpeed;
    ring.speed = baseSpeed * intensity;
  }
}

export default function VantaBackground({ style, intensity }: { style: VantaStyle; intensity: number }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<VantaInstance | undefined>(undefined);

  useEffect(() => {
    if (style === "off" || !elementRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let disposed = false;
    let instance: VantaInstance | undefined;
    void loadFactory(style).then((factory) => {
      if (disposed || !elementRef.current) return;
      instance = factory({
        el: elementRef.current,
        THREE,
        p5,
        ...EFFECT_OPTIONS[style],
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        forceAnimate: true,
        // Keep this after the effect defaults so the user's setting always
        // wins (the Cells defaults previously forced speed back to 0.75).
        speed: intensity,
        minHeight: 200,
        minWidth: 200,
        scale: 1,
        scaleMobile: 0.7,
      });
      instanceRef.current = instance;
      applyIntensity(instance, style, intensity);
    }).catch((error: unknown) => {
      if (!disposed) console.error(`Unable to start the ${style} background`, error);
    });
    return () => {
      disposed = true;
      try {
        instance?.destroy();
      } catch (error) {
        console.error(`Unable to clean up the ${style} background`, error);
      }
      if (instanceRef.current === instance) instanceRef.current = undefined;
    };
  }, [style]);

  useEffect(() => {
    if (instanceRef.current) applyIntensity(instanceRef.current, style, intensity);
  }, [style, intensity]);

  if (style === "off") return null;
  return <div ref={elementRef} className={`vanta-background vanta-background--${style}`} style={{ "--vanta-duration": `${Math.max(6, 24 / intensity)}s`, "--vanta-opacity": Math.min(1, 0.35 + intensity * 0.25) } as CSSProperties} aria-hidden="true" />;
}
