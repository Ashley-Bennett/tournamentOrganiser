import React from "react";
import { Box, Divider, Paper, Typography } from "@mui/material";
import PlayerCardView from "../components/PlayerCardView";
import PlayerCardEditor from "../components/PlayerCardEditor";
import BadgeMark from "../components/BadgeMark";
import {
  assembleCard,
  type CardSlot,
  type EquippedSlot,
} from "../badges/card";
import type { EarnedBadge } from "../badges/types";
import { BADGES, TIERS } from "../badges/registry";
import { tierFor, titleFor } from "../badges/tiers";

/**
 * Every card state on one page.
 *
 * DEV ONLY — the route is registered behind import.meta.env.DEV and never
 * exists in a production build.
 *
 * The card has states that are awkward to reach in the running app: a bare
 * card belongs to a player who has just joined, a diamond tier to one with a
 * hundred events, and an unknown badge id to a client that has not been
 * redeployed. Waiting for real data to produce them means never looking at
 * them, and the bare card is both the majority case at launch and the easiest
 * to leave looking broken.
 */

const WS = "cd77badf-b822-4f30-b059-93e1c3c77a68";

const slot = (over: Partial<CardSlot> = {}): CardSlot => ({
  slot: 1,
  badgeId: "top_cut",
  count: 4,
  workspaceId: null,
  workspaceName: null,
  ...over,
});

const title = (badgeId: string, count: number, ws?: string): CardSlot =>
  slot({
    slot: 0,
    badgeId,
    count,
    workspaceId: ws ? WS : null,
    workspaceName: ws ?? null,
  });

const EDITOR_HELD: EarnedBadge[] = [
  { badgeId: "attendance", count: 31, workspaceId: WS, workspaceName: "Bulwark" },
  { badgeId: "champion", count: 3, workspaceId: null, workspaceName: null },
  { badgeId: "top_cut", count: 12, workspaceId: null, workspaceName: null },
  { badgeId: "spoiler", count: 1, workspaceId: null, workspaceName: null },
];

const EDITOR_EQUIPPED: EquippedSlot[] = [
  { slot: 0, badgeId: "attendance", workspaceId: WS },
  { slot: 1, badgeId: "champion", workspaceId: null },
  { slot: 2, badgeId: "top_cut", workspaceId: null },
  { slot: 3, badgeId: "spoiler", workspaceId: null },
];

function Case({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography
        variant="caption"
        sx={{ color: "text.disabled", display: "block", mb: 0.5, fontFamily: "monospace" }}
      >
        {label}
      </Typography>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        {children}
      </Paper>
    </Box>
  );
}

export default function CardHarness() {
  const pokemon = (slots: CardSlot[], partnerKey: string | null = "25") =>
    assembleCard({ gameId: "pokemon", partnerKey, slots });

  return (
    <Box sx={{ p: 3, width: "100%", maxWidth: 760, mx: "auto" }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Card states
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Dev only. Placeholder badge art — the container is real, the letter
        inside is standing in for a mark nobody has drawn yet.
      </Typography>

      <Case label="bare — a player who has just joined, and the majority case at launch">
        <PlayerCardView name="Marcus Hale" card={pokemon([])} />
      </Case>

      <Case label="title only">
        <PlayerCardView
          name="Marcus Hale"
          card={pokemon([title("attendance", 8, "Bulwark")])}
        />
      </Case>

      <Case label="full — title and three badges">
        <PlayerCardView
          name="Marcus Hale"
          card={pokemon([
            title("attendance", 8, "Bulwark"),
            slot({ slot: 1, badgeId: "top_cut", count: 4 }),
            slot({ slot: 2, badgeId: "champion", count: 3 }),
            slot({ slot: 3, badgeId: "spoiler", count: 1 }),
          ])}
        />
      </Case>

      <Case label="long name, at the top rung">
        <PlayerCardView
          name="Bartholomew Fitzwilliam-Cholmondeley"
          card={pokemon([
            title("attendance", 120, "Red Dragon Vault"),
            slot({ slot: 1, badgeId: "champion", count: 10 }),
          ])}
        />
      </Case>

      <Case label="generic game — a declared-set partner, not normalised">
        <PlayerCardView
          name="Jon Baker"
          card={assembleCard({
            gameId: "generic",
            partnerKey: "knight",
            slots: [title("attendance", 3, "Chess Club")],
          })}
        />
      </Case>

      <Case label="no account — no partner at all, which is the incentive to claim">
        <PlayerCardView
          name="Walk In"
          card={assembleCard({
            gameId: "pokemon",
            partnerKey: null,
            slots: [],
            hasAccount: false,
          })}
        />
      </Case>

      <Case label="no partner chosen — falls back to the game default">
        <PlayerCardView
          name="Aisha Bello"
          card={pokemon([title("top_cut", 12)], null)}
        />
      </Case>

      <Case label="unknown badge id — a client that has not been redeployed">
        <PlayerCardView
          name="Marcus Hale"
          card={pokemon([
            title("not_shipped_yet", 3),
            slot({ slot: 1, badgeId: "also_unknown", count: 2 }),
          ])}
        />
      </Case>

      <Divider sx={{ my: 3 }} />
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        The editor
      </Typography>
      {/* A full loadout is hard to reach in local dev, where the database is
          near-empty and badges come from tournament history. This is the only
          place the take-off control gets looked at before somebody has one. */}
      <Case label="editor · full loadout">
        <PlayerCardEditor
          name="Marcus Hale"
          gameId="pokemon"
          partnerKey="25"
          equipped={EDITOR_EQUIPPED}
          earned={EDITOR_HELD}
          onChange={() => {}}
          onPartnerChange={() => {}}
        />
      </Case>

      <Case label="editor · nothing equipped, quiet empty slots">
        <PlayerCardEditor
          name="Dan Okafor"
          gameId="pokemon"
          partnerKey={null}
          equipped={[]}
          earned={EDITOR_HELD}
          onChange={() => {}}
          onPartnerChange={() => {}}
        />
      </Case>

      <Divider sx={{ my: 3 }} />
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        Line density — the in-round pairings list
      </Typography>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 3 }}>
        {[
          { name: "Aisha Bello", slots: [title("spoiler", 1)] },
          { name: "Dan Okafor", slots: [] },
          { name: "Priya Raman", slots: [title("attendance", 60, "Bulwark")] },
        ].map((r) => (
          <Box key={r.name} sx={{ py: 0.75 }}>
            <PlayerCardView
              name={r.name}
              card={pokemon(r.slots)}
              density="line"
            />
          </Box>
        ))}
      </Paper>

      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        The tier ladder, at every rung
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        {[26, 46, 96].map((size) => (
          <Box
            key={size}
            sx={{
              display: "flex",
              gap: 1.5,
              alignItems: "center",
              mb: 1.5,
              overflowX: "auto",
              pb: 0.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{ width: 42, color: "text.disabled", fontFamily: "monospace" }}
            >
              {size}px
            </Typography>
            {TIERS.map((tier) => (
              <BadgeMark
                key={tier.id}
                badge={BADGES[0]}
                tier={tier}
                size={size}
                title={tier.label}
                count={12}
              />
            ))}
            <BadgeMark badge={BADGES[3]} tier={null} size={size} title="Spoiler" />
          </Box>
        ))}
        <Typography variant="caption" color="text.secondary">
          Circle, hexagon, shield, star, rhombus — then the plaque, for a badge
          with no tier.
        </Typography>
      </Paper>

      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        Every badge at the rung its count reaches
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        {BADGES.map((badge) => {
          const count = badge.thresholds.length > 0 ? badge.thresholds[1] ?? 1 : 1;
          return (
            <Box
              key={badge.id}
              sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.75 }}
            >
              <BadgeMark
                badge={badge}
                tier={tierFor(badge, count)}
                title={titleFor(badge, count)}
                count={count}
              />
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {titleFor(badge, count)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {badge.explanation}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Paper>
    </Box>
  );
}
