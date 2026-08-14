import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The wordmark, dropped as physics bodies.
 *
 * Hand-rolled rather than pulling in a physics engine: eight rigid bodies with
 * gravity, walls, a floor and pairwise separation is a couple of hundred lines,
 * and the landing page had just been cut from ~1.6MB to ~490KB of JavaScript.
 * Adding ~90KB of engine to tumble eight letters would give most of that back.
 *
 * Runs only while on screen, stops once everything has settled, and renders a
 * plain static wordmark when the visitor prefers reduced motion.
 */

const WORD = "CASPAREL";

const GRAVITY = 2100; // px/s²
const RESTITUTION = 0.38; // bounce retained on impact
const FRICTION = 0.82; // tangential damping against the floor
const AIR = 0.999;
const ANGULAR_DAMP = 0.985;
const SLEEP_SPEED = 6; // px/s below which a body is considered at rest
const MAX_STEP = 1 / 30; // clamp so a backgrounded tab cannot explode the sim
// Bodies resting on one another overlap permanently, so the separation pass
// keeps nudging them and a purely stillness-based sleep can take a long time to
// trigger. Freeze after this long regardless: it bounds CPU, and by then the
// pile has visually settled.
const MAX_RUN_MS = 4200;

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  w: number;
  h: number;
  r: number;
  el: HTMLSpanElement | null;
}

function makeBodies(letters: HTMLSpanElement[], width: number): Body[] {
  return letters.map((el, i) => {
    const w = el.offsetWidth || 40;
    const h = el.offsetHeight || 56;
    // Drop within a centred band rather than one lane each, so they collide on
    // the way down and settle into a pile instead of a tidy row.
    const band = Math.min(width * 0.55, 520);
    const slot = band / letters.length;
    return {
      x: (width - band) / 2 + slot * (i + 0.5) + (Math.random() - 0.5) * slot * 0.6,
      y: -h - i * 90 - 40,
      vx: (Math.random() - 0.5) * 120,
      vy: 0,
      angle: (Math.random() - 0.5) * 0.6,
      spin: (Math.random() - 0.5) * 1.1,
      w,
      h,
      r: Math.hypot(w, h) / 2,
      el,
    };
  });
}

export function LetterDrop({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lettersRef = useRef<HTMLSpanElement[]>([]);
  const bodiesRef = useRef<Body[]>([]);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const [reduced, setReduced] = useState(false);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const paint = useCallback(() => {
    for (const b of bodiesRef.current) {
      if (!b.el) continue;
      b.el.style.transform = `translate3d(${b.x - b.w / 2}px, ${b.y - b.h / 2}px, 0) rotate(${b.angle}rad)`;
    }
  }, []);

  const start = useCallback(() => {
    const host = hostRef.current;
    if (!host || runningRef.current) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width === 0 || height === 0) return;

    bodiesRef.current = makeBodies(lettersRef.current.filter(Boolean), width);
    for (const b of bodiesRef.current) {
      if (b.el) b.el.style.opacity = "1";
    }

    runningRef.current = true;
    let last = performance.now();
    let calmFrames = 0;
    const startedAt = performance.now();

    const step = (now: number) => {
      if (!runningRef.current) return;
      const dt = Math.min((now - last) / 1000, MAX_STEP);
      last = now;
      const bodies = bodiesRef.current;

      for (const b of bodies) {
        b.vy += GRAVITY * dt;
        b.vx *= AIR;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.angle += b.spin * dt;
        b.spin *= ANGULAR_DAMP;

        // Floor: bounce, lose tangential speed, and convert some of the impact
        // into rotation so letters topple instead of landing flat.
        const floor = height - b.h / 2;
        if (b.y > floor) {
          b.y = floor;
          if (b.vy > 0) {
            // A glancing landing topples the letter a little; most of the spin
            // is absorbed by the floor rather than carried on.
            b.spin = b.spin * 0.45 + (b.vx / 900) * (Math.random() * 0.6 + 0.4);
            b.vy = -b.vy * RESTITUTION;
            b.vx *= FRICTION;
            if (Math.abs(b.vy) < 40) b.vy = 0;
          }
        }
        // Walls
        const left = b.w / 2;
        const right = width - b.w / 2;
        if (b.x < left) {
          b.x = left;
          b.vx = Math.abs(b.vx) * RESTITUTION;
        } else if (b.x > right) {
          b.x = right;
          b.vx = -Math.abs(b.vx) * RESTITUTION;
        }
      }

      // Pairwise separation. Circle approximation: cheap, and with eight bodies
      // it produces a convincing pile without a full SAT solver.
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const c = bodies[j];
          let dx = c.x - a.x;
          let dy = c.y - a.y;
          const minDist = (a.r + c.r) * 0.72;
          let dist = Math.hypot(dx, dy);
          if (dist === 0) {
            dx = Math.random() - 0.5;
            dy = -1;
            dist = 1;
          }
          if (dist < minDist) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            c.x += nx * overlap;
            c.y += ny * overlap;
            const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
            if (rel < 0) {
              const imp = -rel * 0.5 * (1 + RESTITUTION);
              a.vx -= imp * nx;
              a.vy -= imp * ny;
              c.vx += imp * nx;
              c.vy += imp * ny;
              a.spin -= imp * 0.002;
              c.spin += imp * 0.002;
            }
          }
        }
      }

      paint();

      // Sleep once the pile has been still for a moment. Resting ON another
      // letter is a perfectly good resting place, so this must test stillness
      // rather than contact with the floor.
      const calm = bodies.every(
        (b) =>
          Math.abs(b.vx) < SLEEP_SPEED &&
          Math.abs(b.vy) < SLEEP_SPEED &&
          Math.abs(b.spin) < 0.04,
      );
      calmFrames = calm ? calmFrames + 1 : 0;
      if (calmFrames > 24 || now - startedAt > MAX_RUN_MS) {
        for (const b of bodies) {
          b.vx = 0;
          b.vy = 0;
          b.spin = 0;
        }
        paint();
        runningRef.current = false;
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [paint]);

  const reset = useCallback(() => {
    stop();
    start();
  }, [start, stop]);

  // Respect reduced motion, and only run the sim while the section is visible.
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (media?.matches) {
      setReduced(true);
      return;
    }
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") {
      start();
      return stop;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            start();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(host);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [start, stop]);

  // "R" re-drops the pile, mirroring the hint shown under the wordmark.
  useEffect(() => {
    if (reduced) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reduced, reset]);

  if (reduced) {
    return (
      <div className={className}>
        <p className="select-none text-center text-6xl font-bold tracking-tight text-primary sm:text-8xl">
          {WORD}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={hostRef}
        onClick={reset}
        className="relative h-56 w-full cursor-pointer select-none overflow-hidden sm:h-72"
        role="img"
        aria-label="Casparel"
        data-testid="letter-drop"
      >
        {WORD.split("").map((ch, i) => (
          <span
            key={`${ch}-${i}`}
            ref={(el) => {
              if (el) lettersRef.current[i] = el;
            }}
            aria-hidden="true"
            style={{ opacity: 0, willChange: "transform" }}
            className="absolute left-0 top-0 text-6xl font-bold leading-none tracking-tight text-primary sm:text-8xl"
          >
            {ch}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Click, or press R, to drop them again.
      </p>
    </div>
  );
}
