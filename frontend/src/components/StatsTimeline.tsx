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
 *
 * Each period is a single fixed-width column holding its value, bar and label
 * together. Splitting the bars and the labels into two rows lets the two drift
 * apart whenever their natural widths differ — a percentage above a "4 matches"
 * caption — and the labels then sit under the wrong bars.
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
const COL_WIDTH = 68;
const BAR_WIDTH = 30;

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
        <Skeleton variant="rectangular" height={PLOT_HEIGHT + 64} sx={{ borderRadius: 1 }} />
      ) : points.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          {emptyMessage}
        </Typography>
      ) : (
        <Box sx={{ overflowX: "auto", maxWidth: "100%", pb: 1 }}>
          <Box display="flex" sx={{ minWidth: "min-content" }}>
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
                    sx={{
                      width: COL_WIDTH,
                      flex: `0 0 ${COL_WIDTH}px`,
                      cursor: "default",
                      textAlign: "center",
                    }}
                  >
                    <Typography variant="caption" fontWeight={700} color="text.primary" noWrap>
                      {p.display}
                    </Typography>

                    {/* The bar sits in a fixed-height box whose bottom edge is
                        the axis. Columns are flush, so those edges join into
                        one continuous baseline across the whole chart. */}
                    <Box
                      sx={{
                        height: PLOT_HEIGHT,
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        borderBottom: 1,
                        borderColor: "divider",
                      }}
                    >
                      <Box
                        sx={{
                          width: BAR_WIDTH,
                          height,
                          bgcolor: color,
                          // Rounded data-end only; the bar stays anchored to
                          // the baseline.
                          borderTopLeftRadius: 4,
                          borderTopRightRadius: 4,
                          transition: "height 150ms ease",
                        }}
                      />
                    </Box>

                    <Typography variant="caption" color="text.secondary" display="block" noWrap mt={0.5}>
                      {p.label}
                    </Typography>
                    {p.sub && (
                      <Typography variant="caption" color="text.disabled" display="block" noWrap>
                        {p.sub}
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        </Box>
      )}
    </>
  );
}
