interface BrandIconProps {
  className?: string;
  label?: string;
  title?: string;
}

// Casparel brand mark: an open "C" with a cursor accent, rendered in the
// Deep Indigo → Azure gradient from the brand palette. Kept as inline SVG so
// it stays crisp at any size and works on both light and dark backgrounds.
export default function BrandIcon({ className = "", title, label }: BrandIconProps) {
  const accessibleName = title || label;

  return (
    <svg
      viewBox="0 0 512 512"
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
          x1="149.912"
          y1="149.912"
          x2="362.046"
          y2="362.046"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#163A8A" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <path
        d="M378.082 343.155C359.614 369.023 333.408 388.356 303.242 398.367C273.076 408.377 240.51 408.546 210.241 398.85C179.973 389.154 153.566 370.094 134.831 344.42C116.096 318.746 106 287.783 106 256C106 224.217 116.096 193.255 134.831 167.58C153.566 141.906 179.973 122.846 210.241 113.15C240.51 103.454 273.076 103.623 303.242 113.633C333.408 123.644 359.614 142.977 378.082 168.845L319.483 210.679C309.88 197.228 296.252 187.175 280.566 181.969C264.879 176.764 247.945 176.676 232.205 181.718C216.466 186.76 202.735 196.671 192.992 210.022C183.25 223.372 178 239.473 178 256C178 272.527 183.25 288.628 192.992 301.978C202.735 315.329 216.466 325.24 232.205 330.282C247.945 335.324 264.879 335.236 280.566 330.031C296.252 324.825 309.88 314.772 319.483 301.321L378.082 343.155Z"
        fill="url(#casparel-mark-gradient)"
      />
      <rect x="330" y="233" width="46" height="46" rx="12" fill="#163A8A" />
    </svg>
  );
}
