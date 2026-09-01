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
  Radio,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";

/**
 * A searchable pick-from-a-long-list dialog, shared by the event and deck
 * pickers on both stats pages.
 *
 * Both started as a wall of chips laid out inline. That is fine for six of
 * something and unusable for sixty — on a phone it is the whole screen before
 * it is even useful. Rendering the list in a dialog (full-screen on mobile)
 * keeps the page to a one-line summary and gives the list room to be searched.
 *
 * In `multi` mode choices are held as a draft and applied on Done: the callers
 * refetch when the selection changes, and toggling live would fire a request
 * per tick while someone assembles a ten-event season. `single` mode applies
 * immediately and closes — there is nothing to accumulate.
 */

export interface PickerItem {
  id: string;
  /** Main line. */
  label: string;
  /** Muted second line — a date, a record, a count. */
  secondary?: string;
  /** Short status word shown on the right, e.g. "In progress". */
  badge?: string;
  /** Rendered before the label; deck sprites use this. */
  icon?: React.ReactNode;
  /** Extra text matched by the search box alongside `label`. */
  keywords?: string;
}

/** How many rows to add each time the list is extended. */
const PAGE = 30;

export default function PickerDialog({
  open,
  title,
  items,
  selected,
  multi,
  searchPlaceholder,
  itemNoun = "item",
  onApply,
  onClose,
}: {
  open: boolean;
  title: string;
  items: PickerItem[];
  selected: string[];
  multi: boolean;
  searchPlaceholder?: string;
  /** Singular noun for the apply button, e.g. "event" → "Use 3 events". */
  itemNoun?: string;
  onApply: (ids: string[]) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  const [draft, setDraft] = useState<string[]>(selected);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  // Reset each time it opens, so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (open) {
      setDraft(selected);
      setSearch("");
      setShown(PAGE);
    }
    // `selected` is deliberately not a dependency: re-syncing the draft while
    // the dialog is open would discard the edit in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draftSet = useMemo(() => new Set(draft), [draft]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.keywords ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const visible = matches.slice(0, shown);
  const hidden = matches.length - visible.length;

  function pick(id: string) {
    if (!multi) {
      onApply([id]);
      onClose();
      return;
    }
    setDraft((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {title}
        <IconButton
          onClick={onClose}
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
            placeholder={searchPlaceholder ?? "Search"}
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
              {multi ? `${draft.length} of ${items.length} selected` : `${items.length} to choose from`}
              {search.trim() !== "" && ` · ${matches.length} matching`}
            </Typography>
            {multi && (
              <>
                <Button
                  size="small"
                  onClick={() =>
                    setDraft((cur) => [...new Set([...cur, ...matches.map((i) => i.id)])])
                  }
                >
                  Select {search.trim() ? "matching" : "all"}
                </Button>
                <Button size="small" onClick={() => setDraft([])} disabled={draft.length === 0}>
                  Clear
                </Button>
              </>
            )}
          </Box>
        </Box>

        <Divider />

        <Box sx={{ overflowY: "auto", flex: 1 }}>
          {matches.length === 0 ? (
            <Typography variant="body2" color="text.disabled" sx={{ p: 2 }}>
              Nothing matches “{search.trim()}”.
            </Typography>
          ) : (
            <List dense disablePadding>
              {visible.map((item) => {
                const checked = draftSet.has(item.id);
                return (
                  <ListItemButton key={item.id} onClick={() => pick(item.id)} dense>
                    {multi ? (
                      <Checkbox
                        edge="start"
                        checked={checked}
                        tabIndex={-1}
                        disableRipple
                        size="small"
                      />
                    ) : (
                      <Radio edge="start" checked={checked} tabIndex={-1} disableRipple size="small" />
                    )}
                    {item.icon && (
                      <Box display="flex" alignItems="center" mr={1}>
                        {item.icon}
                      </Box>
                    )}
                    <ListItemText
                      primary={item.label}
                      secondary={item.secondary}
                      primaryTypographyProps={{ variant: "body2" }}
                    />
                    {item.badge && (
                      <Chip label={item.badge} size="small" color="warning" variant="outlined" />
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

      {multi && (
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {draft.length === 0
              ? "Done"
              : `Use ${draft.length} ${itemNoun}${draft.length === 1 ? "" : "s"}`}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
