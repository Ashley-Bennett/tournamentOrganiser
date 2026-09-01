import React, { useCallback, useEffect, useState } from "react";
import { Box, Chip, Collapse, Divider, IconButton, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/**
 * A collapsible section of the stats page.
 *
 * The page has five sections, each with its own filters and a table, and an
 * organiser almost always wants one of them at a time. Collapsing the rest
 * turns a page of scrolling into a list of headings.
 *
 * Open/closed is remembered per browser so someone who lives in the meta share
 * is not re-opening it every visit. A `summary` keeps a collapsed section
 * informative — the heading alone would hide whether there is anything in it.
 *
 * Children are only mounted once the section has been opened. Each section
 * fetches its own data, so mounting all five on load would fire every RPC for
 * panels nobody has looked at; once opened, a section stays mounted so
 * collapsing it does not throw away its filters or refetch on re-open.
 */

const STORAGE_KEY = "matchamp_stats_sections";

function readOpenState(id: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return typeof parsed[id] === "boolean" ? parsed[id] : fallback;
  } catch {
    // Private windows and blocked site data both throw here; the default is
    // a perfectly good answer.
    return fallback;
  }
}

function writeOpenState(id: string, open: boolean): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    parsed[id] = open;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Not being able to remember the preference is not worth surfacing.
  }
}

export default function StatsSection({
  id,
  title,
  hint,
  summary,
  defaultOpen = false,
  children,
}: {
  /** Stable id used to remember this section's open state. */
  id: string;
  title: string;
  hint?: string;
  /** Short status shown beside the title, visible while collapsed. */
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpenState(id, defaultOpen));
  const [everOpened, setEverOpened] = useState(open);

  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  const toggle = useCallback(() => {
    setOpen((cur) => {
      writeOpenState(id, !cur);
      return !cur;
    });
  }, [id]);

  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Box
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          cursor: "pointer",
          userSelect: "none",
          py: 0.5,
          borderRadius: 1,
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <IconButton
          size="small"
          disableRipple
          sx={{
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 150ms ease",
          }}
          aria-hidden
          tabIndex={-1}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
        {summary && <Chip label={summary} size="small" variant="outlined" />}
      </Box>

      <Collapse in={open} unmountOnExit={false} mountOnEnter>
        <Box pt={1} pb={1}>
          {hint && (
            <Typography variant="body2" color="text.disabled" mb={1.5}>
              {hint}
            </Typography>
          )}
          {everOpened ? children : null}
        </Box>
      </Collapse>
    </>
  );
}
