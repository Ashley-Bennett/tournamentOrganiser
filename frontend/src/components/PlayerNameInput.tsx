import { useMemo } from "react";
import {
  Autocomplete,
  Box,
  Chip,
  TextField,
  Typography,
  createFilterOptions,
} from "@mui/material";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import {
  knownPlayerName,
  type WorkspacePlayer,
} from "../types/workspacePlayer";

/** What the caller gets back: a known player (linked) or a plain typed name. */
export interface PlayerNameSelection {
  name: string;
  /** Set when a known player was picked — the entry is linked at insert time. */
  userId: string | null;
}

interface Props {
  value: PlayerNameSelection;
  onChange: (value: PlayerNameSelection) => void;
  knownPlayers: WorkspacePlayer[];
  /** user_ids already in this tournament — filtered out of the suggestions. */
  excludeUserIds: string[];
  label?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  onEnter?: () => void;
}

interface Option {
  userId: string;
  name: string;
  tournamentsPlayed: number;
}

const filter = createFilterOptions<Option | string>();

/**
 * Player name field that doubles as a picker for workspace regulars.
 *
 * Typing a name that nobody in the directory matches behaves exactly like the
 * old plain text field — walk-ins with no account still work. Picking a
 * suggestion attaches their user_id, so the tournament entry is account-linked
 * from the start and never needs a claim link.
 */
export default function PlayerNameInput({
  value,
  onChange,
  knownPlayers,
  excludeUserIds,
  label = "Player name",
  autoFocus,
  disabled,
  inputRef,
  onEnter,
}: Props) {
  const options = useMemo<Option[]>(() => {
    const excluded = new Set(excludeUserIds);
    return knownPlayers
      .filter((p) => !excluded.has(p.user_id))
      .map((p) => ({
        userId: p.user_id,
        name: knownPlayerName(p),
        tournamentsPlayed: p.tournaments_played,
      }));
  }, [knownPlayers, excludeUserIds]);

  return (
    <Autocomplete<Option | string, false, false, true>
      freeSolo
      disabled={disabled}
      options={options}
      value={value.name}
      sx={{ minWidth: 240 }}
      size="small"
      getOptionLabel={(option) =>
        typeof option === "string" ? option : option.name
      }
      isOptionEqualToValue={(option, val) =>
        typeof option !== "string" &&
        typeof val !== "string" &&
        option.userId === val.userId
      }
      // Suppress the "no options" popup for workspaces with no regulars yet —
      // the field should feel like a plain text box until there's something to pick.
      filterOptions={(opts, params) =>
        params.inputValue.length === 0 && opts.length === 0 ? [] : filter(opts, params)
      }
      onInputChange={(_e, input, reason) => {
        // Typing invalidates any previously picked account.
        if (reason === "input") onChange({ name: input, userId: null });
        if (reason === "clear") onChange({ name: "", userId: null });
      }}
      onChange={(_e, selected) => {
        if (selected == null) {
          onChange({ name: "", userId: null });
        } else if (typeof selected === "string") {
          onChange({ name: selected, userId: null });
        } else {
          onChange({ name: selected.name, userId: selected.userId });
        }
      }}
      renderOption={(props, option) => {
        if (typeof option === "string") return <li {...props}>{option}</li>;
        const { key, ...liProps } = props as typeof props & { key: string };
        return (
          <Box component="li" key={key} {...liProps}>
            <HowToRegIcon fontSize="small" color="success" sx={{ mr: 1 }} />
            <Box flexGrow={1}>{option.name}</Box>
            <Typography variant="caption" color="text.secondary">
              {option.tournamentsPlayed === 1
                ? "1 tournament"
                : `${option.tournamentsPlayed} tournaments`}
            </Typography>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          autoFocus={autoFocus}
          autoComplete="off"
          inputRef={inputRef}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter && value.name.trim()) onEnter();
          }}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {value.userId && (
                  <Chip
                    icon={<HowToRegIcon />}
                    label="Linked"
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ fontSize: "0.65rem", height: 20, mr: 0.5 }}
                  />
                )}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
