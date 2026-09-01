import React, { useMemo, useState } from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import EventNoteIcon from "@mui/icons-material/EventNote";
import PickerDialog, { type PickerItem } from "./PickerDialog";

/**
 * Event multi-select for the league and meta share sections.
 *
 * The page keeps a one-line summary; the choosing happens in PickerDialog.
 * See that component for why the list is not laid out inline.
 */

export interface EventOption {
  id: string;
  name: string;
  played_at: string;
  status?: string;
}

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
  const [open, setOpen] = useState(false);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const items: PickerItem[] = useMemo(
    () =>
      options.map((o) => ({
        id: o.id,
        label: o.name,
        secondary: formatDate(o.played_at),
        badge: o.status && o.status !== "completed" ? "In progress" : undefined,
      })),
    [options],
  );

  const selectedOptions = selected
    .map((id) => byId.get(id))
    .filter((o): o is EventOption => o != null);

  return (
    <Box mb={2}>
      <Box display="flex" flexWrap="wrap" gap={1} alignItems="center">
        <Button
          size="small"
          variant="outlined"
          startIcon={<EventNoteIcon />}
          onClick={() => setOpen(true)}
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
              onClick={() => setOpen(true)}
            />
          )}
        </Box>
      )}

      <PickerDialog
        open={open}
        title="Choose events"
        items={items}
        selected={selected}
        multi
        itemNoun="event"
        searchPlaceholder="Search events by name"
        onApply={onChange}
        onClose={() => setOpen(false)}
      />
    </Box>
  );
}
