import { Box, Typography, LinearProgress } from "@mui/material";
import BadgeMark from "./BadgeMark";
import { caseRows, type CaseRow } from "../badges/badgeCase";
import type { EarnedBadge } from "../badges/types";

/**
 * Every badge for this game, held or not.
 *
 * Unheld rows are dimmed rather than hidden or blanked out. A catalogue is
 * worth seeing — it is the answer to "what else is there" — but it must not
 * read as a list of ways somebody is behind, so nothing here shouts and there
 * is no completion percentage.
 */

const CASE_BADGE_PX = 40;

function Row({ row }: { row: CaseRow }) {
  const progress =
    row.next && row.badge.thresholds.length > 0
      ? Math.min(100, Math.round((row.count / (row.count + row.next.needed)) * 100))
      : null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 1,
        // The whole row fades, art included, so an unheld badge reads as one
        // quiet thing rather than a bright mark next to grey words.
        opacity: row.held ? 1 : 0.42,
      }}
    >
      <BadgeMark
        badge={row.badge}
        tier={row.tier}
        title={row.title}
        count={row.held ? row.count : undefined}
        size={CASE_BADGE_PX}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {row.label}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }} noWrap>
          {row.badge.explanation}
        </Typography>
        {progress !== null && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{ flex: 1, height: 4, borderRadius: 2, maxWidth: 160 }}
            />
            <Typography variant="caption" sx={{ color: "text.disabled" }} noWrap>
              {row.next?.needed} to {row.next?.tier.label}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function BadgeCase({
  earned,
  gameId,
}: {
  earned: EarnedBadge[];
  gameId: string | null;
}) {
  const rows = caseRows(earned, gameId);
  if (rows.length === 0) return null;

  return (
    <Box>
      {rows.map((row) => (
        <Row key={row.badge.id} row={row} />
      ))}
    </Box>
  );
}
