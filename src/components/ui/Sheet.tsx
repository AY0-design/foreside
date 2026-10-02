"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cx } from "@/lib/format";

/**
 * Family's dark "act" surface: black sheet, grey cards, white pill action.
 * `side` slides in from the right (browse + pick); `center` rises as a modal (confirm).
 */
export function Sheet({ open, onClose, title, children, footer, variant = "side", labelledBy }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "side" | "center";
  labelledBy: string;
}) {
  // Full transform strings stay on the compositor; reduced motion keeps the fade and drops the slide.
  const reduce = useReducedMotion();
  const hidden = reduce ? { opacity: 0 } : variant === "side" ? { transform: "translateX(100%)" } : { transform: "translateY(40px)", opacity: 0 };
  const shown = reduce ? { opacity: 1 } : variant === "side" ? { transform: "translateX(0%)" } : { transform: "translateY(0px)", opacity: 1 };
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={cx(
              // Fey's slide-over, on Family surfaces.
              "fixed z-50 flex flex-col bg-bg text-fg shadow-pop",
              variant === "side" ? "inset-y-2 right-2 w-[calc(100%-16px)] max-w-md rounded-2xl" : "inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            )}
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 420, damping: 38 }}
          >
            <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3">
              <h2 id={labelledBy} className="text-[15px] font-semibold">{title}</h2>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full bg-panel text-muted hover:bg-panel-strong hover:text-fg">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">{children}</div>
            {footer && <div className="px-6 pt-2 pb-6">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
