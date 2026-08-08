import type { CSSProperties } from "react";

interface BrandIconProps {
  className?: string;
  label?: string;
  title?: string;
}

export default function BrandIcon({ className = "", title, label }: BrandIconProps) {
  const style: CSSProperties = {
    WebkitMaskImage: "url(/brand/schoolar-mark.png?v=2)",
    maskImage: "url(/brand/schoolar-mark.png?v=2)",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "88% auto",
    maskSize: "88% auto",
  };

  return <span aria-hidden={title || label ? undefined : true} aria-label={title || label} role={title || label ? "img" : undefined} className={`inline-block h-14 w-28 shrink-0 bg-current ${className}`} style={style} />;
}
