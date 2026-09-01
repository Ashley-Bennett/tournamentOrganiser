import React from "react";
import { Box, Chip, Typography } from "@mui/material";
import type { StatsPeriod } from "../utils/statsPeriod";

/**
 * Time filter for the stats page: all time, or one calendar year.
 *
 * The years offered are the ones the player actually has results in, newest
 * first, so the list never fills up with empty years.
 *
 * Re-selecting the chip that is already active does nothing. A `StatsPeriod` is
 * an object, so firing `onChange` again would hand the page an equal-but-new
 * value and refetch the whole page off a click that changed nothing.
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
          onClick={() => value.year != null && onChange({ year: null })}
        />
        {years.map((year) => (
          <Chip
            key={year}
            label={String(year)}
            size="small"
            color={value.year === year ? "primary" : "default"}
            variant={value.year === year ? "filled" : "outlined"}
            onClick={() => value.year !== year && onChange({ year })}
          />
        ))}
      </Box>
    </Box>
  );
}
