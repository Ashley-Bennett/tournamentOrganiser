import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import EventNoteIcon from "@mui/icons-material/EventNote";

/**
 * Event multi-select for the league and meta share sections.
 *
 * The picker lives in a dialog rather than inline. A club running weekly has
 * hundreds of events, and a wall of chips is most of the screen on a phone
 * before it is even useful — the page keeps a one-line summary, and the actual
 * choosing happens in a full-screen sheet on mobile.
 *
 * Choices are held as a draft and only applied on Done. Toggling live would
 * refetch the league table on every tick while someone assembles a ten-event
 * season, which is both slow and visually noisy.
 */

export interface EventOption {
  id: string;
  name: string;
  played_at: string;
  status?: string;
}

/** How many rows to add each time the list is extended. */
const PAGE = 30;

/** Selected events named in the collapsed summary before it says "+N more". */
const SUMMARY_CHIPS = 3;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function EventPicker({
  options,
  selected,
  onChange,
}: {
  options: EventOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  // Keep the draft in step when the selection changes underneath us — clearing
  // from the summary while the dialog is shut, for instance.
  useEffect(() => {
    if (!open) setDraft(selected);
  }, [selected, open]);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const draftSet = useMemo(() => new Set(draft), [draft]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);

  const visible = matches.slice(0, shown);
  const hidden = matches.length - visible.length;

  function openDialog() {
    setDraft(selected);
    setSearch("");
    setShown(PAGE);
    setOpen(true);
  }

  function toggle(id: string) {
    setDraft((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  const selectedOptions = selected
    .map((id) => byId.get(id))
    .filter((o): o is EventOption => o != null);

  return (
    <Box mb={2}>
      {/* Collapsed summary — one line whether there are six events or six hundred. */}
      <Box display="flex" flexWrap="wrap" gap={1} alignItems="center">
        <Button
          size="small"
          variant="outlined"
          startIcon={<EventNoteIcon />}
          onClick={openDialog}
          disabled={options.length === 0}
        >
          {selected.length === 0 ? "Choose events" : "Change events"}
        </Button>

        {options.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            No events to pick from yet.
          </Typography>
        ) : selected.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            None selected
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">
              {selected.length} selected
            </Typography>
            <Button size="small" onClick={() => onChange([])}>
              Clear
            </Button>
          </>
        )}
      </Box>

      {selectedOptions.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={0.75} mt={1}>
          {selectedOptions.slice(0, SUMMARY_CHIPS).map((o) => (
            <Chip
              key={o.id}
              size="small"
              label={`${o.name} · ${formatDate(o.played_at)}`}
              onDelete={() => onChange(selected.filter((id) => id !== o.id))}
            />
          ))}
          {selectedOptions.length > SUMMARY_CHIPS && (
            <Chip
              size="small"
              variant="outlined"
              label={`+${selectedOptions.length - SUMMARY_CHIPS} more`}
              onClick={openDialog}
            />
          )}
        </Box>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen={fullScreen}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pr: 6 }}>
          Choose events
          <IconButton
            onClick={() => setOpen(false)}
            sx={{ position: "absolute", right: 8, top: 8 }}
            aria-label="Close"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0, display: "flex", flexDirection: "column" }}>
          <Box p={2} pb={1}>
            <TextField
              fullWidth
              size="small"
              autoFocus={!fullScreen}
              placeholder="Search events by name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShown(PAGE);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Box display="flex" flexWrap="wrap" gap={1} alignItems="center" mt={1.5}>
              <Typography variant="body2" color="text.secondary" flexGrow={1}>
                {draft.length} of {options.length} selected
                {search.trim() !== "" && ` · ${matches.length} matching`}
              </Typography>
              <Button
                size="small"
                onClick={() =>
                  setDraft((cur) => [
                    ...new Set([...cur, ...matches.map((o) => o.id)]),
                  ])
                }
              >
                Select {search.trim() ? "matching" : "all"}
              </Button>
              <Button size="small" onClick={() => setDraft([])} disabled={draft.length === 0}>
                Clear
              </Button>
            </Box>
          </Box>

          <Divider />

          <Box sx={{ overflowY: "auto", flex: 1 }}>
            {matches.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ p: 2 }}>
                No events match “{search.trim()}”.
              </Typography>
            ) : (
              <List dense disablePadding>
                {visible.map((o) => {
                  const checked = draftSet.has(o.id);
                  return (
                    <ListItemButton key={o.id} onClick={() => toggle(o.id)} dense>
                      <Checkbox
                        edge="start"
                        checked={checked}
                        tabIndex={-1}
                        disableRipple
                        size="small"
                      />
                      <ListItemText
                        primary={o.name}
                        secondary={formatDate(o.played_at)}
                        primaryTypographyProps={{ variant: "body2" }}
                      />
                      {o.status && o.status !== "completed" && (
                        <Chip label="In progress" size="small" color="warning" variant="outlined" />
                      )}
                    </ListItemButton>
                  );
                })}
              </List>
            )}

            {hidden > 0 && (
              <Box p={1.5}>
                <Button fullWidth size="small" onClick={() => setShown((s) => s + PAGE)}>
                  Show {Math.min(hidden, PAGE)} more of {hidden}
                </Button>
              </Box>
            )}
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={apply}>
            {draft.length === 0 ? "Done" : `Use ${draft.length} event${draft.length === 1 ? "" : "s"}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
