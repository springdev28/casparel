import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The wordmark, dropped as physics bodies, and playable.
 *
 * Hand-rolled rather than pulling in a physics engine: eight rigid bodies with
 * gravity, walls, a floor and pairwise separation is a couple of hundred lines,
 * and the landing page had just been cut from ~1.6MB to ~490KB of JavaScript.
 * Adding ~90KB of engine to tumble eight letters would give most of that back.
 *
 * You can grab a letter and fling it: pointer drags move the body directly and
 * the release velocity is taken from the last few pointer samples, so a quick
 * flick throws it. The hues cycle continuously, which also means the sim can
 * never look frozen even once the pile has settled.
 *
 * Renders a plain static wordmark when the visitor prefers reduced motion.
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
// trigger. Freeze the physics after this long: it bounds CPU, and by then the
// pile has visually settled. Dragging wakes it straight back up.
const MAX_RUN_MS = 4200;
const HUE_SPEED = 26; // degrees per second
const HUE_SPREAD = 26; // degrees between neighbouring letters
const THROW_SCALE = 1000; // px/s per px/ms of pointer travel
const MAX_THROW = 2600; // px/s, so a violent flick cannot slingshot off-screen

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
  hue: number;
  /** Set while this body is being dragged; physics is suspended for it. */
  held: boolean;
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
      hue: i * HUE_SPREAD,
      held: false,
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
  // Physics can be asleep while the colour loop keeps running, so the two have
  // separate flags. `simUntil` is the wall-clock deadline for the physics.
  const simActiveRef = useRef(false);
  const simUntilRef = useRef(0);
  const calmRef = useRef(0);
  const lastFrameRef = useRef(0);
  const onScreenRef = useRef(false);
  // Drag state: which body, the grab offset, and recent pointer samples used to
  // work out the release velocity.
  const dragRef = useRef<{
    id: number;
    body: Body;
    dx: number;
    dy: number;
    samples: { x: number; y: number; t: number }[];
  } | null>(null);
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
      b.el.style.color = `hsl(${b.hue % 360} 82% 62%)`;
    }
  }, []);

  /** Wake the physics for another run, e.g. after a drag or a re-drop. */
  const wake = useCallback((ms = MAX_RUN_MS) => {
    simActiveRef.current = true;
    simUntilRef.current = performance.now() + ms;
    calmRef.current = 0;
  }, []);

  /**
   * Start the frame loop. Kept separate from spawning so scrolling away and
   * back, or switching tabs, resumes the existing pile rather than re-dropping
   * it. The loop is the only thing burning CPU, so it is stopped whenever the
   * section is off-screen or the tab is hidden.
   */
  const run = useCallback(() => {
    const host = hostRef.current;
    if (!host || runningRef.current || !bodiesRef.current.length) return;
    runningRef.current = true;
    lastFrameRef.current = performance.now();

    const step = (now: number) => {
      if (!runningRef.current) return;
      const dt = Math.min((now - lastFrameRef.current) / 1000, MAX_STEP);
      lastFrameRef.current = now;
      const bodies = bodiesRef.current;
      const h = host.clientHeight;
      const w = host.clientWidth;

      // Colour never stops, even once the bodies have gone to sleep.
      for (const b of bodies) b.hue += HUE_SPEED * dt;

      if (simActiveRef.current) {
        for (const b of bodies) {
          if (b.held) continue;
          b.vy += GRAVITY * dt;
          b.vx *= AIR;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.angle += b.spin * dt;
          b.spin *= ANGULAR_DAMP;

          // Floor: bounce, lose tangential speed, and convert some of the
          // impact into rotation so letters topple instead of landing flat.
          const floor = h - b.h / 2;
          if (b.y > floor) {
            b.y = floor;
            if (b.vy > 0) {
              // A glancing landing topples the letter a little; most of the
              // spin is absorbed by the floor rather than carried on.
              b.spin = b.spin * 0.45 + (b.vx / 900) * (Math.random() * 0.6 + 0.4);
              b.vy = -b.vy * RESTITUTION;
              b.vx *= FRICTION;
              if (Math.abs(b.vy) < 40) b.vy = 0;
            }
          }
          // Ceiling, so a hard upward throw does not vanish above the box.
          const ceiling = b.h / 2;
          if (b.y < ceiling) {
            b.y = ceiling;
            if (b.vy < 0) b.vy = -b.vy * RESTITUTION;
          }
          // Walls
          const left = b.w / 2;
          const right = w - b.w / 2;
          if (b.x < left) {
            b.x = left;
            b.vx = Math.abs(b.vx) * RESTITUTION;
          } else if (b.x > right) {
            b.x = right;
            b.vx = -Math.abs(b.vx) * RESTITUTION;
          }
        }

        // Pairwise separation. Circle approximation: cheap, and with eight
        // bodies it produces a convincing pile without a full SAT solver.
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
              const nx = dx / dist;
              const ny = dy / dist;
              // A held body is infinitely heavy: it pushes others aside and is
              // not pushed itself, so you can shove the pile around with one.
              const aShare = a.held ? 0 : c.held ? 1 : 0.5;
              const cShare = c.held ? 0 : a.held ? 1 : 0.5;
              const overlap = minDist - dist;
              a.x -= nx * overlap * aShare;
              a.y -= ny * overlap * aShare;
              c.x += nx * overlap * cShare;
              c.y += ny * overlap * cShare;
              const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
              if (rel < 0) {
                const imp = -rel * 0.5 * (1 + RESTITUTION);
                if (!a.held) {
                  a.vx -= imp * nx;
                  a.vy -= imp * ny;
                  a.spin -= imp * 0.002;
                }
                if (!c.held) {
                  c.vx += imp * nx;
                  c.vy += imp * ny;
                  c.spin += imp * 0.002;
                }
              }
            }
          }
        }

        // Sleep once the pile has been still for a moment. Resting ON another
        // letter is a perfectly good resting place, so this must test stillness
        // rather than contact with the floor.
        const calm = bodies.every(
          (b) =>
            b.held ||
            (Math.abs(b.vx) < SLEEP_SPEED &&
              Math.abs(b.vy) < SLEEP_SPEED &&
              Math.abs(b.spin) < 0.04),
        );
        calmRef.current = calm ? calmRef.current + 1 : 0;
        if (calmRef.current > 24 || now > simUntilRef.current) {
          for (const b of bodies) {
            if (b.held) continue;
            b.vx = 0;
            b.vy = 0;
            b.spin = 0;
          }
          simActiveRef.current = false;
        }
      }

      paint();
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [paint]);

  /** Drop a fresh pile from above and run it. */
  const start = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const width = host.clientWidth;
    if (width === 0 || host.clientHeight === 0) return;

    bodiesRef.current = makeBodies(lettersRef.current.filter(Boolean), width);
    for (const b of bodiesRef.current) {
      if (b.el) b.el.style.opacity = "1";
    }
    wake();
    run();
  }, [run, wake]);

  const reset = useCallback(() => {
    stop();
    start();
  }, [start, stop]);

  /** Nearest body to a point within the host, or null if the click missed. */
  const bodyAt = useCallback((x: number, y: number): Body | null => {
    let best: Body | null = null;
    let bestDist = Infinity;
    for (const b of bodiesRef.current) {
      const dist = Math.hypot(b.x - x, b.y - y);
      // Generous radius: these are letterforms, not solid rectangles, and a
      // grab that lands in the hole of an "A" should still pick it up.
      if (dist < b.r * 1.05 && dist < bestDist) {
        best = b;
        bestDist = dist;
      }
    }
    return best;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const host = hostRef.current;
      if (!host || !bodiesRef.current.length) return;
      const rect = host.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const body = bodyAt(x, y);
      if (!body) {
        // A click on empty space re-drops the pile, as the hint promises.
        reset();
        return;
      }
      body.held = true;
      body.vx = 0;
      body.vy = 0;
      body.spin = 0;
      dragRef.current = {
        id: e.pointerId,
        body,
        dx: body.x - x,
        dy: body.y - y,
        samples: [{ x, y, t: performance.now() }],
      };
      host.setPointerCapture(e.pointerId);
      wake();
      e.preventDefault();
    },
    [bodyAt, reset, wake],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const host = hostRef.current;
      if (!drag || !host || drag.id !== e.pointerId) return;
      const rect = host.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      drag.body.x = x + drag.dx;
      drag.body.y = y + drag.dy;
      drag.samples.push({ x, y, t: performance.now() });
      if (drag.samples.length > 5) drag.samples.shift();
      wake();
    },
    [wake],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== e.pointerId) return;
      dragRef.current = null;
      hostRef.current?.releasePointerCapture?.(e.pointerId);

      // Release velocity from the pointer's recent travel, so a flick throws
      // the letter and simply letting go drops it.
      const samples = drag.samples;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      if (dt > 0 && samples.length > 1) {
        const scale = THROW_SCALE / dt;
        drag.body.vx = Math.max(
          -MAX_THROW,
          Math.min(MAX_THROW, (last.x - first.x) * scale),
        );
        drag.body.vy = Math.max(
          -MAX_THROW,
          Math.min(MAX_THROW, (last.y - first.y) * scale),
        );
        drag.body.spin = (drag.body.vx / 1400) * (Math.random() * 0.8 + 0.6);
      }
      drag.body.held = false;
      wake();
    },
    [wake],
  );

  // Respect reduced motion, and only run the sim while the section is visible.
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (media?.matches) {
      setReduced(true);
      return;
    }
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") {
      onScreenRef.current = true;
      start();
      return stop;
    }
    // The hue loop runs forever, so the frame loop is tied to visibility: it
    // only costs anything while the wordmark is actually on screen in a
    // foreground tab. Scrolling back resumes the pile where it was left.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          onScreenRef.current = entry.isIntersecting;
          if (!entry.isIntersecting) {
            stop();
          } else if (bodiesRef.current.length) {
            run();
          } else {
            start();
          }
        }
      },
      { threshold: 0.08 },
    );
    observer.observe(host);

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (onScreenRef.current) run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [run, start, stop]);

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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-56 w-full touch-none select-none overflow-hidden sm:h-72"
        style={{ cursor: "grab" }}
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
        Grab a letter and throw it. Click the space around them, or press R, to
        drop them again.
      </p>
    </div>
  );
}
