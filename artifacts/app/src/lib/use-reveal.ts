import { useEffect, useRef } from "react";

/**
 * Reveal-on-scroll without an animation library.
 *
 * Attach the returned ref to a container; every descendant carrying `.reveal`
 * gains `.reveal--in` as it scrolls into view. Costs one IntersectionObserver
 * and no bundle weight, which matters on a page whose whole job is to load fast.
 *
 * Falls back to showing everything immediately when IntersectionObserver is
 * missing or the visitor prefers reduced motion.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (targets.length === 0) return;

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("reveal--in"));
      return;
    }

    const show = (el: HTMLElement, stagger: boolean) => {
      // Stagger siblings so a grid resolves in sequence rather than at once.
      const delay = stagger ? Number(el.dataset.revealDelay ?? 0) : 0;
      if (delay > 0) el.style.transitionDelay = `${delay}ms`;
      el.classList.add("reveal--in");
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          // Also reveal anything already scrolled PAST. A fast scroll, an
          // anchor jump or the End key can move an element from below the
          // viewport to above it without it ever intersecting — without this
          // it would stay at opacity 0 forever, silently losing content.
          const scrolledPast = entry.boundingClientRect.bottom < 0;
          if (!entry.isIntersecting && !scrolledPast) continue;
          show(el, entry.isIntersecting);
          observer.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    targets.forEach((el) => observer.observe(el));

    // IntersectionObserver only reports *changes*. A fast scroll, an anchor
    // jump or the End key can move an element from below the viewport to above
    // it in one frame — it never intersects, no entry is delivered, and it
    // would stay at opacity 0 forever. Sweep on scroll for anything that has
    // reached or passed the viewport.
    let queued = false;
    const sweep = () => {
      queued = false;
      let remaining = false;
      for (const el of targets) {
        if (el.classList.contains("reveal--in")) continue;
        if (el.getBoundingClientRect().top < window.innerHeight) {
          show(el, false);
          observer.unobserve(el);
        } else {
          remaining = true;
        }
      }
      if (!remaining) window.removeEventListener("scroll", onScroll);
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(sweep);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return containerRef;
}
