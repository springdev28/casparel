interface BrandIconProps {
  className?: string;
  label?: string;
  title?: string;
}

// Casparel brand mark: a geometric, faceted "C" with a cursor accent, in the
// Deep Indigo → Azure gradient. Kept as inline SVG so it stays crisp at any
// size and pairs with the "Casparel" wordmark as the 02 (light) / 03 (dark)
// lockup — the wordmark color is supplied by the surrounding surface.
export default function BrandIcon({ className = "", title, label }: BrandIconProps) {
  const accessibleName = title || label;

  return (
    <svg
      viewBox="0 0 320 320"
      className={`inline-block h-10 w-10 shrink-0 ${className}`}
      role={accessibleName ? "img" : undefined}
      aria-label={accessibleName}
      aria-hidden={accessibleName ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {accessibleName ? <title>{accessibleName}</title> : null}
      <defs>
        <linearGradient
          id="casparel-mark-gradient"
          x1="64.442"
          y1="46.8392"
          x2="287.522"
          y2="235.218"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#163A8A" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <g fill="url(#casparel-mark-gradient)">
        <path d="M295.111 0H96L24.8889 71.1111H224L295.111 0Z" />
        <path d="M38.8663 259.105L88.0321 308.271L157.982 277.654L69.4832 189.156L38.8663 259.105Z" />
        <path d="M88.032 11.133L38.8663 60.2987L69.4832 130.248L157.981 41.7498L88.032 11.133Z" />
        <path d="M24.8889 71.1111V248.889L96 320V0L24.8889 71.1111Z" />
        <path d="M96 320H295.111L224 248.889H24.8889L96 320Z" />
      </g>
      <rect x="221.156" y="123.733" width="73.3867" height="73.3867" rx="20.5483" fill="#163A8A" />
    </svg>
  );
}
