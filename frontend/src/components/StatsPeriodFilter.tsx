import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import {
  SEASON_START_MONTH,
  seasonLabel,
  seasonQuarters,
  type StatsPeriod,
} from "../utils/season";

/**
 * Season / quarter picker for the stats page.
 *
 * The seasons offered are the ones the player actually has results in, newest
 * first, so the list never fills up with empty years. Picking a season reveals
 * its four quarters (Sep–Nov, Dec–Feb, Mar–May, Jun–Aug).
 */
export default function StatsPeriodFilter({
  seasons,
  value,
  onChange,
  seasonStartMonth = SEASON_START_MONTH,
}: {
  seasons: number[];
  value: StatsPeriod;
  onChange: (p: StatsPeriod) => void;
  /** 0-indexed month the game's season starts in. */
  seasonStartMonth?: number;
}) {
  if (seasons.length === 0) return null;

  return (
    <Box mb={2}>
      <Box display="flex" flexWrap="wrap" gap={0.75} alignItems="center">
        <Typography variant="caption" color="text.secondary" mr={0.5}>
          Period
        </Typography>
        <Chip
          label="All time"
          size="small"
          color={value.seasonStartYear == null ? "primary" : "default"}
          variant={value.seasonStartYear == null ? "filled" : "outlined"}
          onClick={() => onChange({ seasonStartYear: null, quarter: null })}
        />
        {seasons.map((year) => (
          <Chip
            key={year}
            label={seasonLabel(year, seasonStartMonth)}
            size="small"
            color={value.seasonStartYear === year ? "primary" : "default"}
            variant={value.seasonStartYear === year ? "filled" : "outlined"}
            // Switching season resets the quarter — Q2 of one season means
            // nothing in another, and the full season is the useful default.
            onClick={() => onChange({ seasonStartYear: year, quarter: null })}
          />
        ))}
      </Box>

      {value.seasonStartYear != null && (
        <Box display="flex" flexWrap="wrap" gap={0.75} alignItems="center" mt={1}>
          <Typography variant="caption" color="text.secondary" mr={0.5}>
            Quarter
          </Typography>
          <Chip
            label="Whole season"
            size="small"
            color={value.quarter == null ? "secondary" : "default"}
            variant={value.quarter == null ? "filled" : "outlined"}
            onClick={() => onChange({ ...value, quarter: null })}
          />
          {seasonQuarters(seasonStartMonth).map((q) => (
            <Chip
              key={q.quarter}
              label={`${q.label} · ${q.months}`}
              size="small"
              color={value.quarter === q.quarter ? "secondary" : "default"}
              variant={value.quarter === q.quarter ? "filled" : "outlined"}
              onClick={() => onChange({ ...value, quarter: q.quarter })}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
