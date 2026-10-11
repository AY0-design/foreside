"use client";

import { useLayoutEffect, useRef } from "react";

/** Renders nothing; on mount, centres the current tab in its scrolling `<nav>` so long tab rows open on the active one. */
export function ActiveTabScroll() {
  const marker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const nav = marker.current?.parentElement;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, []);
  return <span ref={marker} hidden />;
}
