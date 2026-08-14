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

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          // Stagger siblings so a grid resolves in sequence rather than at once.
          const delay = Number(el.dataset.revealDelay ?? 0);
          if (delay > 0) el.style.transitionDelay = `${delay}ms`;
          el.classList.add("reveal--in");
          observer.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return containerRef;
}
