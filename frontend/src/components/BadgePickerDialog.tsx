import { Box } from "@mui/material";
import PickerDialog, { type PickerItem } from "./PickerDialog";
import BadgeMark from "./BadgeMark";
import { toNextTier } from "../badges/tiers";
import { TITLE_SLOT, type EquippedSlot } from "../badges/card";
import { badgeKey, parseBadgeKey, slotOptions } from "../badges/picker";
import type { EarnedBadge } from "../badges/types";

/**
 * Choosing what goes in a slot.
 *
 * Only badges the player actually holds are listed. There is deliberately no
 * "locked" section here: this is the dialog for getting dressed, and a list of
 * things you cannot wear belongs in the badge case, where it is information
 * rather than an obstacle.
 */

/** Small enough for a list row, large enough to tell the rungs apart. */
const ROW_BADGE_PX = 30;

function secondaryFor(option: {
  badge: { explanation: string };
  count: number;
  next: string | null;
}): string {
  const parts = [option.badge.explanation];
  if (option.count > 1) parts.push(`×${option.count}`);
  if (option.next) parts.push(option.next);
  return parts.join(" · ");
}

export default function BadgePickerDialog({
  open,
  slot,
  gameId,
  earned,
  equipped,
  onPick,
  onClose,
}: {
  open: boolean;
  /** Which slot is being filled. Null when nothing is open. */
  slot: number | null;
  gameId: string | null;
  earned: EarnedBadge[];
  equipped: EquippedSlot[];
  onPick: (slot: number, badgeId: string, workspaceId: string | null) => void;
  onClose: () => void;
}) {
  const active = slot ?? TITLE_SLOT;
  const options = slotOptions(earned, gameId, equipped, active);

  const current = equipped.find((s) => s.slot === active);
  const selected = current ? [badgeKey(current.badgeId, current.workspaceId)] : [];

  const items: PickerItem[] = options.map((o) => {
    // "9 more to Silver" is the one number that makes a badge feel like it is
    // going somewhere, and the picker is where somebody is already thinking
    // about which of theirs is worth showing.
    const progress = toNextTier(o.badge, o.count);
    return {
      id: o.key,
      label: o.label,
      secondary: secondaryFor({
        badge: o.badge,
        count: o.count,
        next:
          progress && progress.needed > 0
            ? `${progress.needed} to ${progress.tier.label}`
            : null,
      }),
      keywords: `${o.badge.title} ${o.title} ${o.badge.explanation}`,
      icon: (
        <Box sx={{ mr: 1.5, display: "flex" }}>
          <BadgeMark
            badge={o.badge}
            tier={o.tier}
            title={o.title}
            size={ROW_BADGE_PX}
          />
        </Box>
      ),
    };
  });

  return (
    <PickerDialog
      open={open && slot !== null}
      title={active === TITLE_SLOT ? "Choose a title" : "Choose a badge"}
      items={items}
      selected={selected}
      multi={false}
      searchPlaceholder="Search your badges"
      itemNoun="badge"
      onApply={(ids) => {
        const id = ids[0];
        if (!id || slot === null) return;
        const { badgeId, workspaceId } = parseBadgeKey(id);
        onPick(slot, badgeId, workspaceId);
      }}
      onClose={onClose}
    />
  );
}
