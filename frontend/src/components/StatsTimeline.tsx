import React, { useMemo } from "react";
import { Box, Skeleton, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";

/**
 * The shared stats timeline — one bar per period, used by both the player and
 * the organiser stats pages.
 *
 * Callers map their own rows into `TimelinePoint`s, so the component knows
 * nothing about win rates or attendance: it draws magnitude over time and
 * nothing else. `value` drives the bar height, `display` is the number a
 * reader actually sees, and `sub` is the denominator behind it.
 *
 * One series, so there is no legend — the section heading names the measure.
 * Bars carry a single hue for magnitude; `tone` is reserved for a genuine
 * threshold call-out (a win rate that is good or bad) and is left unset for
 * counts, where "more" is not automatically "better".
 */

export type TimelineTone = "good" | "bad" | "neutral";

export interface TimelinePoint {
  /** Stable react key — the period start is the natural choice. */
  key: string;
  /** Short axis label, e.g. "Aug 26" or "Q3 26". */
  label: string;
  /** Magnitude driving the bar height. `null` renders an empty period. */
  value: number | null;
  /** The number shown to the reader, pre-formatted, e.g. "62%" or "14". */
  display: string;
  /** The denominator or context line, e.g. "8 matches". */
  sub?: string;
  tone?: TimelineTone;
}

export type TimelineBucket = "month" | "quarter" | "year";

const TONE_COLOR: Record<TimelineTone, string> = {
  good: "success.main",
  bad: "error.main",
  neutral: "text.primary",
};

const PLOT_HEIGHT = 96;

export default function StatsTimeline({
  points,
  loading,
  emptyMessage,
  bucket,
  onBucketChange,
}: {
  points: TimelinePoint[];
  loading: boolean;
  emptyMessage: string;
  /** Omit both bucket props to render without the Month/Quarter/Year toggle. */
  bucket?: TimelineBucket;
  onBucketChange?: (b: TimelineBucket) => void;
}) {
  // Bars are scaled against the largest period, not against zero-to-100, so a
  // quiet stretch of months still has visible shape.
  const max = useMemo(
    () => points.reduce((m, p) => Math.max(m, p.value ?? 0), 0),
    [points],
  );

  const showToggle = bucket != null && onBucketChange != null;

  return (
    <>
      {showToggle && (
        <Box display="flex" justifyContent="flex-end" mb={1.5}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={bucket}
            onChange={(_, next) => next && onBucketChange(next as TimelineBucket)}
            aria-label="Timeline grouping"
          >
            <ToggleButton value="month">Month</ToggleButton>
            <ToggleButton value="quarter">Quarter</ToggleButton>
            <ToggleButton value="year">Year</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {loading ? (
        <Skeleton variant="rectangular" height={PLOT_HEIGHT + 48} sx={{ borderRadius: 1 }} />
      ) : points.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          {emptyMessage}
        </Typography>
      ) : (
        <Box sx={{ overflowX: "auto", pb: 1 }}>
          <Box
            display="flex"
            alignItems="flex-end"
            gap={0.75}
            sx={{
              minWidth: "min-content",
              // Recessive baseline — the bars are the data, the axis is not.
              borderBottom: 1,
              borderColor: "divider",
              pb: 0,
            }}
          >
            {points.map((p) => {
              const height =
                p.value == null || max === 0
                  ? 2
                  : Math.max(2, Math.round((p.value / max) * PLOT_HEIGHT));
              const color = p.tone ? TONE_COLOR[p.tone] : "primary.main";

              return (
                <Tooltip
                  key={p.key}
                  title={
                    <Box>
                      <Typography variant="caption" display="block" fontWeight={600}>
                        {p.label}
                      </Typography>
                      <Typography variant="caption" display="block">
                        {p.display}
                        {p.sub ? ` · ${p.sub}` : ""}
                      </Typography>
                    </Box>
                  }
                  arrow
                >
                  <Box
                    display="flex"
                    flexDirection="column"
                    alignItems="center"
                    sx={{ minWidth: 44, cursor: "default" }}
                  >
                    <Typography variant="caption" fontWeight={700} color="text.primary" mb={0.5}>
                      {p.display}
                    </Typography>
                    <Box
                      sx={{
                        width: 28,
                        height,
                        bgcolor: color,
                        // Rounded data-end only; the bar stays anchored to the baseline.
                        borderTopLeftRadius: 4,
                        borderTopRightRadius: 4,
                        transition: "height 150ms ease",
                      }}
                    />
                  </Box>
                </Tooltip>
              );
            })}
          </Box>

          {/* Axis labels sit below the baseline rule, in muted ink. */}
          <Box display="flex" gap={0.75} sx={{ minWidth: "min-content", mt: 0.5 }}>
            {points.map((p) => (
              <Box key={p.key} sx={{ minWidth: 44, textAlign: "center" }}>
                <Typography variant="caption" color="text.secondary" display="block" noWrap>
                  {p.label}
                </Typography>
                {p.sub && (
                  <Typography variant="caption" color="text.disabled" display="block" noWrap>
                    {p.sub}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </>
  );
}
