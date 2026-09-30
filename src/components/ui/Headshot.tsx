"use client";

import { useState } from "react";
import Image from "next/image";

/** Player photo that falls back to an initial when the CDN has no image (it returns 403). */
export function Headshot({ src, name, size }: { src: string | null; name: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="grid size-full place-items-center font-bold text-muted" style={{ fontSize: Math.max(11, size * 0.36) }}>
        {name.replace(/^[A-Z]\./, "").slice(0, 1)}
      </span>
    );
  }
  return <Image src={src} alt="" width={size * 2} height={size * 2} onError={() => setFailed(true)} className="size-full translate-y-[6%] scale-110 object-cover object-top" />;
}
