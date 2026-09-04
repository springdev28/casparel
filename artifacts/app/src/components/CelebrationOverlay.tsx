/**
 * @fileOverview Web UI role: provides the reusable Celebration Overlay component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  onCelebration,
  prefersReducedMotion,
  type CelebrationEvent,
} from "../lib/feedback";

/**
 * Confetti for milestones, hand-rolled on one canvas.
 *
 * Same reasoning as LetterDrop: a burst of rectangles with gravity, drag and
 * spin is ~150 lines, while canvas-confetti would add a dependency to a bundle
 * that was deliberately slimmed. The canvas exists only while a burst is
 * live — the component renders nothing when idle, so every page pays zero.
 *
 * It portals to document.body as a fixed, pointer-events-none, aria-hidden
 * layer above the z-50 shell chrome: the shell frame is a fixed viewport box
 * with an internal scroller, so anything mounted inside it would clip.
 *
 * Colors are resolved from the theme's chart/primary custom properties at
 * fire time — never hardcoded — so user brand colors and both themes are
 * honored. celebrate() already no-ops under prefers-reduced-motion; the
 * listener double-checks in case it is invoked directly.
 */

const GRAVITY = 1150; // px/s²
const DRAG = 0.9; // per-second exponential velocity decay
const FADE_S = 0.45; // opacity ramp at end of life
const MAX_PARTICLES = 420;
const MAX_STEP = 1 / 30; // clamp so a backgrounded tab cannot explode the sim

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  isRound: boolean;
  life: number; // seconds remaining
}

/** Theme colors as hsl() strings, each with a lighter twin for sparkle. */
function resolvePalette(): string[] {
  const style = getComputedStyle(document.documentElement);
  const tokens = [
    "--chart-1",
    "--chart-2",
    "--chart-3",
    "--chart-4",
    "--chart-5",
    "--primary",
    "--accent",
  ];
  const palette: string[] = [];
  for (const token of tokens) {
    const channels = style.getPropertyValue(token).trim();
    if (!channels) continue;
    palette.push(`hsl(${channels})`);
    const parts = channels.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
    if (parts) {
      const lighter = Math.min(90, parseFloat(parts[3]) + 16);
      palette.push(`hsl(${parts[1]} ${parts[2]}% ${lighter}%)`);
    }
  }
  // Only reachable if the design-system tokens failed to load entirely.
  return palette.length > 0 ? palette : ["hsl(226 71% 40%)"];
}

function spawnBurst(
  particles: Particle[],
  palette: string[],
  originX: number,
  originY: number,
  count: number,
  centerAngle: number, // radians; -π/2 is straight up
  spread: number,
): void {
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) return;
    const angle = centerAngle + (Math.random() - 0.5) * spread;
    const speed = 520 + Math.random() * 620;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 5,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 14,
      color: palette[Math.floor(Math.random() * palette.length)],
      isRound: Math.random() < 0.25,
      life: 1.5 + Math.random() * 0.9,
    });
  }
}

export function CelebrationOverlay() {
  const [active, setActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const pendingRef = useRef<CelebrationEvent[]>([]);
  // The loop is started from two places — the mount effect and the listener —
  // and must never depend on a state *transition* to run: a burst that ends in
  // the same tick a new one arrives coalesces true→false→true into "no change",
  // and an effect keyed on that would never re-run. These refs let either
  // caller start the loop directly and make a second start a no-op.
  const runningRef = useRef(false);
  const stopRef = useRef<(() => void) | null>(null);

  const startLoop = useCallback(() => {
    if (runningRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    // Not mounted yet: setActive(true) is in flight and the effect below will
    // start the loop once the canvas exists.
    if (!canvas || !context) return;
    runningRef.current = true;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener("resize", size);

    let frame = 0;
    stopRef.current = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", size);
      runningRef.current = false;
      stopRef.current = null;
    };

    const spawnPending = () => {
      const palette = resolvePalette();
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (const event of pendingRef.current.splice(0)) {
        if (event.intensity === "full") {
          // Two corner cannons angled inward plus a center lift.
          spawnBurst(particlesRef.current, palette, 0, h, 70, -Math.PI / 3, 0.9);
          spawnBurst(
            particlesRef.current,
            palette,
            w,
            h,
            70,
            (-2 * Math.PI) / 3,
            0.9,
          );
          spawnBurst(
            particlesRef.current,
            palette,
            w / 2,
            h * 0.62,
            60,
            -Math.PI / 2,
            1.6,
          );
        } else {
          spawnBurst(
            particlesRef.current,
            palette,
            w / 2,
            h * 0.58,
            90,
            -Math.PI / 2,
            1.9,
          );
        }
      }
    };
    spawnPending();

    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_STEP);
      last = now;
      // Bursts fired while the loop is already running join the same canvas.
      if (pendingRef.current.length > 0) spawnPending();

      const particles = particlesRef.current;
      const drag = Math.exp(-DRAG * dt);
      const floor = window.innerHeight + 40;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.vy += GRAVITY * dt;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;
        if (p.life <= 0 || p.y > floor) particles.splice(i, 1);
      }

      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of particles) {
        context.globalAlpha = Math.min(1, Math.max(0, p.life / FADE_S));
        context.fillStyle = p.color;
        context.translate(p.x, p.y);
        context.rotate(p.rotation);
        if (p.isRound) {
          context.beginPath();
          context.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          context.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        }
        context.rotate(-p.rotation);
        context.translate(-p.x, -p.y);
      }
      context.globalAlpha = 1;

      if (particles.length > 0 || pendingRef.current.length > 0) {
        frame = requestAnimationFrame(step);
      } else {
        stopRef.current?.();
        setActive(false);
      }
    };
    frame = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    return onCelebration((event) => {
      if (prefersReducedMotion()) return;
      pendingRef.current.push(event);
      setActive(true);
      // Starts straight away when the canvas is already mounted, including in
      // the window between a finished burst and React committing its unmount.
      startLoop();
    });
  }, [startLoop]);

  // Mounts the canvas, then runs the burst; tears down cleanly on unmount.
  useEffect(() => {
    if (!active) return;
    startLoop();
    // Particles deliberately survive a stop: if React unmounts the canvas in
    // the same tick a new burst starts it, the effect restarts the loop and
    // the burst continues rather than vanishing.
    return () => stopRef.current?.();
  }, [active, startLoop]);

  if (!active) return null;

  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // h-full w-full is not redundant with inset-0: a canvas is a replaced
      // element, so with width/height auto it lays out at its intrinsic size —
      // the backing store, which is device pixels — and a 2x screen would put
      // most of the confetti past the edge of the viewport.
      className="pointer-events-none fixed inset-0 h-full w-full z-[60]"
    />,
    document.body,
  );
}
