import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

/**
 * Event multi-select for the league and meta share sections.
 *
 * A workspace that has been running weekly for two years has hundreds of
 * events, so this never renders them all: it searches by name, shows a page at
 * a time, and keeps whatever is already selected pinned at the top regardless
 * of the current search — otherwise typing a filter would appear to silently
 * drop selections that are still very much active.
 */

export interface EventOption {
  id: string;
  name: string;
  played_at: string;
  status?: string;
}

const PAGE = 20;

export default function EventPicker({
  options,
  selected,
  onChange,
}: {
  options: EventOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const { pinned, rest } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (o: EventOption) =>
      q === "" || o.name.toLowerCase().includes(q);
    return {
      pinned: options.filter((o) => selectedSet.has(o.id)),
      rest: options.filter((o) => !selectedSet.has(o.id) && matches(o)),
    };
  }, [options, selectedSet, search]);

  const visible = rest.slice(0, shown);
  const hidden = rest.length - visible.length;

  function toggle(id: string) {
    onChange(
      selectedSet.has(id) ? selected.filter((s) => s !== id) : [...selected, id],
    );
  }

  function chip(o: EventOption) {
    const isOn = selectedSet.has(o.id);
    return (
      <Chip
        key={o.id}
        size="small"
        label={`${o.name} · ${new Date(o.played_at).toLocaleDateString()}`}
        color={isOn ? "primary" : "default"}
        variant={isOn ? "filled" : "outlined"}
        onClick={() => toggle(o.id)}
      />
    );
  }

  if (options.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled" mb={2}>
        No events to pick from yet.
      </Typography>
    );
  }

  return (
    <Box mb={2}>
      <Box display="flex" flexWrap="wrap" gap={1} alignItems="center" mb={1.5}>
        <TextField
          size="small"
          placeholder="Search events"
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
          sx={{ minWidth: 220 }}
        />
        <Typography variant="body2" color="text.secondary">
          {selected.length} selected
        </Typography>
        {selected.length > 0 && (
          <Button size="small" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
        {rest.length > 0 && (
          <Button size="small" onClick={() => onChange([...selected, ...rest.map((o) => o.id)])}>
            Select {search.trim() ? "matching" : "all"}
          </Button>
        )}
      </Box>

      {pinned.length > 0 && (
        <Box display="flex" flexWrap="wrap" gap={0.75} mb={1}>
          {pinned.map(chip)}
        </Box>
      )}

      <Box display="flex" flexWrap="wrap" gap={0.75}>
        {visible.length === 0 && search.trim() !== "" ? (
          <Typography variant="body2" color="text.disabled">
            No events match “{search.trim()}”.
          </Typography>
        ) : (
          visible.map(chip)
        )}
      </Box>

      {hidden > 0 && (
        <Button size="small" sx={{ mt: 1 }} onClick={() => setShown((s) => s + PAGE)}>
          Show {Math.min(hidden, PAGE)} more of {hidden}
        </Button>
      )}
    </Box>
  );
}
