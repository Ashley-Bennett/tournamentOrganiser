import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  ButtonBase,
  Tooltip,
  IconButton,
  Button,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ClearIcon from "@mui/icons-material/CloseOutlined";
import ChevronIcon from "@mui/icons-material/ChevronRight";
import BadgeMark from "./BadgeMark";
import PlayerCardView from "./PlayerCardView";
import BadgePickerDialog from "./BadgePickerDialog";
import PartnerPickerDialog from "./PartnerPickerDialog";
import {
  MAX_BADGE_SLOTS,
  TITLE_SLOT,
  assembleCard,
  hydrateSlots,
  type CardSlot,
  type EquippedSlot,
} from "../badges/card";
import { equipInSlot } from "../badges/picker";
import { resolveBadge } from "../badges/tiers";
import { hasPartner, partnerImage } from "../games/partners";
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="overline"
      sx={{ display: "block", mt: 2, color: "text.secondary" }}
    >
      {children}
    </Typography>
  );
}

function EmptySlot({
  label,
  onPick,
  width = SLOT_PX,
}: {
  label: string;
  onPick: () => void;
  width?: number;
}) {
  return (
    <ButtonBase
      onClick={onPick}
      aria-label={label}
      sx={{
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
        "&:hover": { borderColor: "text.secondary", color: "text.secondary" },
      }}
    >
      <AddIcon fontSize="small" />
    </ButtonBase>
  );
}

function FilledSlot({
  slot,
  onPick,
  onClear,
}: {
  slot: CardSlot;
  onPick: () => void;
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
      <ButtonBase
        onClick={onPick}
        aria-label={`Change ${resolved.label}`}
        sx={{ borderRadius: 1.5 }}
      >
        <BadgeMark
          badge={resolved.badge}
          tier={resolved.tier}
          title={resolved.title}
          count={slot.count}
          size={SLOT_PX}
        />
      </ButtonBase>
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
  onPartnerChange,
}: {
  name: string;
  gameId: string;
  partnerKey: string | null;
  equipped: EquippedSlot[];
  earned: EarnedBadge[];
  /** Called with the whole loadout; the caller saves it. */
  onChange: (next: EquippedSlot[]) => void;
  onPartnerChange: (key: string) => void;
}) {
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [pickingPartner, setPickingPartner] = useState(false);

  const hydrated = hydrateSlots(equipped, earned);
  const card = assembleCard({ gameId, partnerKey, slots: hydrated });

  const at = (slot: number) => hydrated.find((s) => s.slot === slot) ?? null;
  const clear = (slot: number) =>
    onChange(equipped.filter((s) => s.slot !== slot));

  const title = at(TITLE_SLOT);
  const badgeSlots = Array.from({ length: MAX_BADGE_SLOTS }, (_, i) => i + 1);
  const partnerSrc = partnerImage(gameId, partnerKey);

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

      {/* Only for games that have one. A partner row on a game with no partner
          is an empty promise the card will never keep. */}
      {hasPartner(gameId) && (
        <>
          <SectionLabel>Partner</SectionLabel>
          <Box sx={{ mt: 0.5 }}>
            {partnerSrc ? (
              <ButtonBase
                onClick={() => setPickingPartner(true)}
                aria-label="Change partner"
                sx={{
                  borderRadius: 1.5,
                  p: 0.5,
                  border: "1px solid",
                  borderColor: "divider",
                  "&:hover": { borderColor: "text.secondary" },
                }}
              >
                <Box
                  component="img"
                  src={partnerSrc}
                  alt=""
                  sx={{ width: SLOT_PX, height: SLOT_PX, objectFit: "contain" }}
                />
              </ButtonBase>
            ) : (
              <EmptySlot
                label="Choose a partner"
                onPick={() => setPickingPartner(true)}
              />
            )}
          </Box>
        </>
      )}

      <SectionLabel>Title</SectionLabel>
      {/* The title is wider than a badge slot because it holds words, and a
          square placeholder would suggest it takes a mark. */}
      <Box sx={{ mt: 0.5 }}>
        {title ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <FilledSlot
              slot={title}
              onPick={() => setPickingSlot(TITLE_SLOT)}
              onClear={() => clear(TITLE_SLOT)}
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {card.title?.label}
            </Typography>
          </Box>
        ) : (
          <EmptySlot
            label="Choose a title"
            width={SLOT_PX * 3}
            onPick={() => setPickingSlot(TITLE_SLOT)}
          />
        )}
      </Box>

      <SectionLabel>Badges</SectionLabel>
      {/* Wider than the gap on the card itself: each slot carries a take-off
          control on its top-right corner, and at the card's spacing that
          control sits on top of the badge beside it. */}
      <Box sx={{ display: "flex", gap: 2.5, mt: 0.5, flexWrap: "wrap" }}>
        {badgeSlots.map((n) => {
          const filled = at(n);
          return filled ? (
            <FilledSlot
              key={n}
              slot={filled}
              onPick={() => setPickingSlot(n)}
              onClear={() => clear(n)}
            />
          ) : (
            <EmptySlot
              key={n}
              label={`Choose a badge for slot ${n}`}
              onPick={() => setPickingSlot(n)}
            />
          );
        })}
      </Box>

      {/* A link out rather than an unfolding panel. The catalogue wants the
          art at a size worth looking at and everything in view at once, and
          neither fits under a card editor. */}
      <Button
        component={RouterLink}
        // The game is already chosen here, so the wall opens on it rather than
        // asking again.
        to={`/me/badges?game=${encodeURIComponent(gameId)}`}
        size="small"
        endIcon={<ChevronIcon />}
        sx={{ mt: 2, ml: -1 }}
      >
        All badges
      </Button>

      <BadgePickerDialog
        open={pickingSlot !== null}
        slot={pickingSlot}
        gameId={gameId}
        earned={earned}
        equipped={equipped}
        onPick={(slot, badgeId, workspaceId) =>
          onChange(equipInSlot(equipped, slot, { badgeId, workspaceId }))
        }
        onClose={() => setPickingSlot(null)}
      />

      <PartnerPickerDialog
        open={pickingPartner}
        gameId={gameId}
        partnerKey={partnerKey}
        onPick={onPartnerChange}
        onClose={() => setPickingPartner(false)}
      />
    </Box>
  );
}
