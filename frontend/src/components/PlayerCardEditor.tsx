import { Box, Typography, ButtonBase, Tooltip, IconButton } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ClearIcon from "@mui/icons-material/CloseOutlined";
import BadgeMark from "./BadgeMark";
import PlayerCardView from "./PlayerCardView";
import {
  MAX_BADGE_SLOTS,
  TITLE_SLOT,
  assembleCard,
  hydrateSlots,
  type CardSlot,
  type EquippedSlot,
} from "../badges/card";
import { resolveBadge } from "../badges/tiers";
import type { EarnedBadge } from "../badges/types";

/**
 * Editing your own card.
 *
 * The preview at the top is the real component at the real density, not a
 * mock-up of it. Everything below is a way of changing what it draws. A player
 * choosing what a room full of people will see about them should never have to
 * guess whether the thing they are editing is the thing that gets shown.
 *
 * Empty slots are quiet on purpose. There is no toggle to hide them: a row of
 * loud "unlock me" placeholders turns somebody's card into a progress bar for
 * a game they did not agree to play, and a bare card is a legitimate way to
 * look rather than a half-finished one.
 */

/** Matches the card preview, so a slot is the size of the thing it becomes. */
const SLOT_PX = 46;

function EmptySlot({
  label,
  onPick,
  width = SLOT_PX,
}: {
  label: string;
  onPick?: () => void;
  width?: number;
}) {
  const frame = {
    width,
    height: SLOT_PX,
    borderRadius: 1.5,
    border: "1px dashed",
    borderColor: "divider",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "text.disabled",
    flex: "none",
  } as const;

  // Without a picker the slot is a placeholder, not a control. Rendering it as
  // a button that does nothing is worse than rendering it as what it is.
  if (!onPick) {
    return (
      <Box sx={frame} aria-hidden>
        <AddIcon fontSize="small" sx={{ opacity: 0.5 }} />
      </Box>
    );
  }

  return (
    <ButtonBase
      onClick={onPick}
      aria-label={label}
      sx={{
        ...frame,
        "&:hover": { borderColor: "text.secondary", color: "text.secondary" },
      }}
    >
      <AddIcon fontSize="small" />
    </ButtonBase>
  );
}

function FilledSlot({
  slot,
  onClear,
}: {
  slot: CardSlot;
  onClear: () => void;
}) {
  const resolved = resolveBadge({
    badgeId: slot.badgeId,
    count: slot.count,
    workspaceId: slot.workspaceId,
    workspaceName: slot.workspaceName,
  });
  if (!resolved) return null;

  return (
    <Box sx={{ position: "relative", flex: "none" }}>
      <BadgeMark
        badge={resolved.badge}
        tier={resolved.tier}
        title={resolved.title}
        count={slot.count}
        size={SLOT_PX}
      />
      <Tooltip title={`Take off ${resolved.label}`}>
        <IconButton
          size="small"
          onClick={onClear}
          aria-label={`Take off ${resolved.label}`}
          sx={{
            position: "absolute",
            top: -8,
            right: -10,
            p: 0.2,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            "&:hover": { bgcolor: "background.paper" },
          }}
        >
          <ClearIcon sx={{ fontSize: 13 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default function PlayerCardEditor({
  name,
  gameId,
  partnerKey,
  equipped,
  earned,
  onChange,
  onPickSlot,
}: {
  name: string;
  gameId: string;
  partnerKey: string | null;
  equipped: EquippedSlot[];
  earned: EarnedBadge[];
  /** Called with the whole loadout; the caller saves it. */
  onChange: (next: EquippedSlot[]) => void;
  /** Phase 3. Until a picker exists, empty slots are quiet placeholders. */
  onPickSlot?: (slot: number) => void;
}) {
  const hydrated = hydrateSlots(equipped, earned);
  const card = assembleCard({ gameId, partnerKey, slots: hydrated });

  const at = (slot: number) => hydrated.find((s) => s.slot === slot) ?? null;
  const clear = (slot: number) =>
    onChange(equipped.filter((s) => s.slot !== slot));

  const title = at(TITLE_SLOT);
  const badgeSlots = Array.from(
    { length: MAX_BADGE_SLOTS },
    (_, i) => i + 1,
  );

  return (
    <Box>
      <Box
        sx={{
          p: 1.5,
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <PlayerCardView name={name} card={card} />
      </Box>

      <Typography
        variant="overline"
        sx={{ display: "block", mt: 2, color: "text.secondary" }}
      >
        Title
      </Typography>
      {/* The title is wider than a badge slot because it holds words, and a
          square placeholder would suggest it takes a mark. */}
      <Box sx={{ mt: 0.5 }}>
        {title ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <FilledSlot slot={title} onClear={() => clear(TITLE_SLOT)} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {card.title?.label}
            </Typography>
          </Box>
        ) : (
          <EmptySlot
            label="Choose a title"
            width={SLOT_PX * 3}
            onPick={onPickSlot && (() => onPickSlot(TITLE_SLOT))}
          />
        )}
      </Box>

      <Typography
        variant="overline"
        sx={{ display: "block", mt: 2, color: "text.secondary" }}
      >
        Badges
      </Typography>
      {/* Wider than the gap on the card itself: each slot carries a take-off
          control on its top-right corner, and at the card's spacing that
          control sits on top of the badge beside it. */}
      <Box sx={{ display: "flex", gap: 2.5, mt: 0.5, flexWrap: "wrap" }}>
        {badgeSlots.map((n) => {
          const filled = at(n);
          return filled ? (
            <FilledSlot key={n} slot={filled} onClear={() => clear(n)} />
          ) : (
            <EmptySlot
              key={n}
              label={`Choose a badge for slot ${n}`}
              onPick={onPickSlot && (() => onPickSlot(n))}
            />
          );
        })}
      </Box>
    </Box>
  );
}
