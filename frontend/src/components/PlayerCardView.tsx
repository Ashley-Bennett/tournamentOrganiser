import React from "react";
import { Box, Typography } from "@mui/material";
import NormalizedSprite from "./NormalizedSprite";
import BadgeMark from "./BadgeMark";
import { partnerSourceFor } from "../games/partners";
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
/** Badges on a card are 26px, per the design brief. */
const BADGE_PX = 26;

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
}: {
  name: string;
  card: PlayerCard;
  density?: CardDensity;
  partnerSize?: number;
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
        alignItems: "center",
        gap: 1.5,
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

      <Box sx={{ minWidth: 0, flex: 1 }}>
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
              mb: 0.25,
              maxWidth: "100%",
            }}
            noWrap
          >
            {card.title.label}
          </Typography>
        )}

        <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ lineHeight: 1.2 }}>
          {name}
        </Typography>

        {/* The badge's own explanation, identical on everyone who wears it —
            never this player's record, which would be scouting data. */}
        {card.title && (
          <Typography
            variant="caption"
            sx={{ display: "block", color: "text.disabled" }}
            noWrap
          >
            {card.title.badge.explanation}
          </Typography>
        )}
      </Box>

      {card.badges.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.75, flex: "none" }}>
          {card.badges.map((b) => (
            <BadgeMark
              key={`${b.badge.id}:${b.workspaceName ?? ""}`}
              badge={b.badge}
              tier={b.tier}
              title={b.title}
              size={BADGE_PX}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
