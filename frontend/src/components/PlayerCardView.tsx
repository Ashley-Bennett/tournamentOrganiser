import React from "react";
import { Box, Typography } from "@mui/material";
import NormalizedSprite from "./NormalizedSprite";
import BadgeMark from "./BadgeMark";
import { partnerSourceFor } from "../games/partners";
import { explanationFor } from "../badges/tiers";
import type { PlayerCard } from "../badges/card";

/**
 * A player's card, as the room sees it.
 *
 * One component at two densities, because the density belongs to the surface
 * and never to the player: the same card is full on your phone and a single
 * line on a projector showing sixteen tables.
 *
 * Nothing here throws or reserves space it cannot fill. A card is chrome
 * around somebody's name in a room full of people — if the badges do not
 * resolve, the name still renders, and a row of empty slots is worse than a
 * ragged list.
 */

export type CardDensity =
  /** Phone, profile, pre-round board. Partner, title, explanation, badges. */
  | "full"
  /** In-round pairings. Name with the worn title beneath it, nothing else. */
  | "line";

const PARTNER_PX = 48;

/**
 * Badges on a full card are drawn at the badge-case size rather than the
 * 26px used in a dense list. This card goes on a projector, and a mark small
 * enough to be a favicon is not worth showing at all across a room.
 */
const BADGE_PX = 46;

function Partner({
  gameId,
  src,
  size,
}: {
  gameId: string | null;
  src: string;
  size: number;
}) {
  // Species artwork is framed inconsistently — a Wailord fills its canvas and a
  // Diglett floats in whitespace — so it is normalised to sit at a consistent
  // weight beside a name, the same treatment the standings table uses.
  //
  // A declared set is drawn to a common frame already, and normalising a
  // vector by sampling its pixels would be work for no gain.
  const normalise = partnerSourceFor(gameId).kind === "pokemon";

  if (normalise) {
    return (
      <Box sx={{ width: size, height: size, flex: "none" }}>
        <NormalizedSprite src={src} size={size} />
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={src}
      alt=""
      sx={{ width: size, height: size, flex: "none", objectFit: "contain" }}
    />
  );
}

export default function PlayerCardView({
  name,
  card,
  density = "full",
  partnerSize = PARTNER_PX,
  badgeSize = BADGE_PX,
}: {
  name: string;
  card: PlayerCard;
  density?: CardDensity;
  partnerSize?: number;
  badgeSize?: number;
}) {
  if (density === "line") {
    return (
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {name}
        </Typography>
        {/* No title equipped renders nothing at all: a reserved-but-empty slot
            on half the rows reads as broken, where a ragged list does not. */}
        {card.title && (
          <Typography
            variant="caption"
            noWrap
            sx={{ display: "block", color: "text.secondary", fontWeight: 500 }}
          >
            {card.title.label}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        // On a narrow screen the badges wrap onto their own row beneath, which
        // gives the title and the name the full width rather than squeezing
        // them into whatever the badges leave behind.
        flexWrap: "wrap",
        alignItems: "center",
        rowGap: 1,
        columnGap: 1.5,
        minWidth: 0,
        py: 0.5,
      }}
    >
      {card.partnerImage && (
        <Partner
          gameId={card.gameId}
          src={card.partnerImage}
          size={partnerSize}
        />
      )}

      {/* Name first. It is the primary thing on the card, and putting the
          title above it sandwiched the person between two pieces of badge
          metadata. Title and explanation now sit together, so the line that
          explains the claim is adjacent to the claim it explains: who, then
          what they claim, then what that means. */}
      <Box sx={{ minWidth: 0, flex: "1 1 160px" }}>
        <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ lineHeight: 1.25 }}>
          {name}
        </Typography>

        {card.title && (
          <Typography
            variant="caption"
            component="div"
            sx={{
              display: "inline-block",
              fontWeight: 700,
              letterSpacing: ".02em",
              px: 0.9,
              py: 0.2,
              borderRadius: 1,
              bgcolor: "action.selected",
              mt: 0.25,
              maxWidth: "100%",
            }}
            noWrap
          >
            {card.title.label}
          </Typography>
        )}

        {/* The badge's own explanation, carrying the player's number where the
            badge counts: "8 events finished here". The count is already drawn
            on the badge itself, so the sentence is saying out loud what the
            card already shows rather than volunteering anything new. Still
            never this player's *record* — wins and losses are scouting data
            and are not on a card. */}
        {card.title && (
          <Typography
            variant="caption"
            sx={{ display: "block", color: "text.disabled" }}
            noWrap
          >
            {explanationFor(card.title.badge, card.title.count)}
          </Typography>
        )}
      </Box>

      {card.badges.length > 0 && (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            // Full width below sm so the wrapped row spans the card rather
            // than hugging the right edge under the name.
            width: { xs: "100%", sm: "auto" },
            flex: { xs: "1 0 100%", sm: "none" },
            // Spread across the row on a phone: one badge centres, three sit
            // evenly, and neither looks like it was left over at an edge.
            justifyContent: { xs: "space-evenly", sm: "flex-end" },
          }}
        >
          {card.badges.map((b) => (
            <BadgeMark
              key={`${b.badge.id}:${b.workspaceName ?? ""}`}
              badge={b.badge}
              tier={b.tier}
              title={b.title}
              count={b.count}
              size={badgeSize}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
