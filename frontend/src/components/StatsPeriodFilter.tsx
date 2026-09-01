import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import type { StatsPeriod } from "../utils/statsPeriod";

/**
 * Time filter for the stats page: all time, or one calendar year.
 *
 * The years offered are the ones the player actually has results in, newest
 * first, so the list never fills up with empty years.
 */
export default function StatsPeriodFilter({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: StatsPeriod;
  onChange: (p: StatsPeriod) => void;
}) {
  if (years.length === 0) return null;

  return (
    <Box mb={2}>
      <Box display="flex" flexWrap="wrap" gap={0.75} alignItems="center">
        <Typography variant="caption" color="text.secondary" mr={0.5}>
          Period
        </Typography>
        <Chip
          label="All time"
          size="small"
          color={value.year == null ? "primary" : "default"}
          variant={value.year == null ? "filled" : "outlined"}
          onClick={() => onChange({ year: null })}
        />
        {years.map((year) => (
          <Chip
            key={year}
            label={String(year)}
            size="small"
            color={value.year === year ? "primary" : "default"}
            variant={value.year === year ? "filled" : "outlined"}
            onClick={() => onChange({ year })}
          />
        ))}
      </Box>
    </Box>
  );
}
