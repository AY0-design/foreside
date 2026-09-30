"use client";

import { ArrowRight } from "lucide-react";
import type { PlayerSummary } from "@/lib/types";
import { DetailRow, PillButton, PlayerAvatar } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { price, pts } from "@/lib/format";

export interface PendingTransfer {
  out: PlayerSummary;
  in: PlayerSummary;
  gain: number | null;
  horizon: 1 | 5;
}

/** Family's confirm step: summary rows, a reassuring footnote, one primary pill. */
export function ConfirmTransfer({ pending, bank, costsHit, hitCost, onCancel, onConfirm }: {
  pending: PendingTransfer | null;
  bank: number;
  costsHit: boolean;
  hitCost: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open={pending !== null}
      onClose={onCancel}
      variant="center"
      title="Confirm transfer"
      labelledBy="confirm-transfer-title"
      footer={
        pending && (
          <div className="space-y-3">
            <p className="text-center text-[12px] leading-snug text-muted">Updates your Foreside squad only. Make the real transfer in the FPL app before the deadline.</p>
            <PillButton size="lg" className="w-full" onClick={onConfirm}>
              Confirm
            </PillButton>
          </div>
        )
      }
    >
      {pending && (
        <div className="space-y-5">
          <div className="flex items-center justify-center gap-6 pt-1">
            <div className="flex flex-col items-center gap-1.5 opacity-60">
              <PlayerAvatar photo={pending.out.photo} badge={pending.out.teamBadge} short={pending.out.teamShort} name={pending.out.webName} size={48} />
              <span className="text-[13px] font-semibold">{pending.out.webName}</span>
            </div>
            <ArrowRight className="text-muted" size={18} aria-label="replaced by" />
            <div className="flex flex-col items-center gap-1.5">
              <PlayerAvatar photo={pending.in.photo} badge={pending.in.teamBadge} short={pending.in.teamShort} name={pending.in.webName} size={48} />
              <span className="text-[13px] font-semibold">{pending.in.webName}</span>
            </div>
          </div>
          <div>
            {pending.gain !== null && (
              <DetailRow label={pending.horizon === 1 ? "Squad gain this GW" : "Squad gain, next 5"} value={<span className={pending.gain >= 0 ? "text-green" : "text-red"}>{pending.gain >= 0 ? "+" : ""}{pts(pending.gain)} xPts</span>} />
            )}
            <DetailRow label="Selling" value={`${pending.out.webName} · ${price(pending.out.price)}`} />
            <DetailRow label="Buying" value={`${pending.in.webName} · ${price(pending.in.price)}`} />
            <DetailRow label="Bank after" value={price(Math.round((bank + pending.out.price - pending.in.price) * 10) / 10)} />
            <DetailRow label="Cost" value={costsHit ? <span className="text-red">−{hitCost} pts hit</span> : "Free transfer"} />
          </div>
        </div>
      )}
    </Sheet>
  );
}
