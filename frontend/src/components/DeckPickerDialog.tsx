import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import {
  getArtworkUrl,
  getPokemonList,
  getSpriteUrl,
  type PokemonEntry,
} from "../utils/pokemonCache";

interface Props {
  open: boolean;
  onClose: () => void;
  initialPokemon1: number | null;
  initialPokemon2: number | null;
  onSave: (p1: number | null, p2: number | null) => Promise<void>;
}

// ── Slot card ─────────────────────────────────────────────────────────────────

function PokemonSlot({
  label,
  pokemonId,
  pokemonName,
  active,
  onClick,
  onClear,
}: {
  label: string;
  pokemonId: number | null;
  pokemonName: string | null;
  active: boolean;
  onClick: () => void;
  onClear: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        flex: 1,
        minHeight: 88,
        border: 2,
        borderStyle: pokemonId ? "solid" : "dashed",
        borderColor: active ? "primary.main" : pokemonId ? "divider" : "action.disabled",
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        cursor: "pointer",
        transition: "border-color 0.15s",
        p: 1,
        "&:hover": { borderColor: "primary.main" },
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", position: "absolute", top: 4, left: 8, fontSize: "0.65rem" }}
      >
        {label}
      </Typography>

      {pokemonId ? (
        <>
          <img
            src={getArtworkUrl(pokemonId)}
            alt={pokemonName ?? ""}
            style={{ width: 56, height: 56, objectFit: "contain" }}
          />
          <Typography variant="caption" sx={{ mt: 0.25 }}>
            {pokemonName}
          </Typography>
          <Tooltip title="Clear">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              sx={{ position: "absolute", top: 2, right: 2, p: 0.25 }}
            >
              <CloseIcon sx={{ fontSize: "0.85rem" }} />
            </IconButton>
          </Tooltip>
        </>
      ) : (
        <Typography variant="caption" color="text.disabled">
          Empty
        </Typography>
      )}
    </Box>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

const DeckPickerDialog: React.FC<Props> = ({
  open,
  onClose,
  initialPokemon1,
  initialPokemon2,
  onSave,
}) => {
  const [pokemon1, setPokemon1] = useState<number | null>(null);
  const [pokemon2, setPokemon2] = useState<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<1 | 2>(1);

  const [allPokemon, setAllPokemon] = useState<PokemonEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset state and load pokemon list when dialog opens
  useEffect(() => {
    if (!open) return;

    setPokemon1(initialPokemon1);
    setPokemon2(initialPokemon2);
    setActiveSlot(initialPokemon1 == null ? 1 : initialPokemon2 == null ? 2 : 1);
    setSearchQuery("");
    setSaveError(null);

    if (allPokemon.length > 0) return; // already loaded

    setListLoading(true);
    setListError(null);
    getPokemonList()
      .then((list) => { setAllPokemon(list); })
      .catch(() => { setListError("Could not load Pokémon list."); })
      .finally(() => { setListLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Filter results — max 3
  const searchResults =
    searchQuery.trim().length > 0
      ? allPokemon
          .filter((p) =>
            p.displayName.toLowerCase().includes(searchQuery.toLowerCase()),
          )
          .slice(0, 3)
      : [];

  const getName = (id: number | null) =>
    id == null ? null : (allPokemon.find((p) => p.id === id)?.displayName ?? `#${id}`);

  const handleSelect = (entry: PokemonEntry) => {
    if (activeSlot === 1) {
      setPokemon1(entry.id);
      // Auto-advance to slot 2 if it's empty
      if (pokemon2 == null) setActiveSlot(2);
    } else {
      setPokemon2(entry.id);
    }
    setSearchQuery("");
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(pokemon1, pokemon2);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPokemon1(initialPokemon1);
    setPokemon2(initialPokemon2);
    setSearchQuery("");
    setSaveError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Choose your Pokémon</DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* Slot row */}
        <Box display="flex" gap={1.5} mb={2}>
          <PokemonSlot
            label="Slot 1"
            pokemonId={pokemon1}
            pokemonName={getName(pokemon1)}
            active={activeSlot === 1}
            onClick={() => setActiveSlot(1)}
            onClear={() => { setPokemon1(null); setActiveSlot(1); }}
          />
          <PokemonSlot
            label="Slot 2"
            pokemonId={pokemon2}
            pokemonName={getName(pokemon2)}
            active={activeSlot === 2}
            onClick={() => setActiveSlot(2)}
            onClear={() => { setPokemon2(null); setActiveSlot(2); }}
          />
        </Box>

        {/* Search */}
        <TextField
          fullWidth
          size="small"
          placeholder={`Search for slot ${activeSlot}…`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        {/* Results */}
        <Box mt={1} minHeight={48}>
          {listLoading && (
            <Box display="flex" justifyContent="center" py={1}>
              <CircularProgress size={20} />
            </Box>
          )}
          {listError && (
            <Alert severity="error" sx={{ mt: 1 }}>{listError}</Alert>
          )}
          {!listLoading && !listError && searchResults.map((entry) => (
            <Box
              key={entry.id}
              onClick={() => handleSelect(entry)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1,
                py: 0.5,
                cursor: "pointer",
                borderRadius: 1,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <img
                src={getSpriteUrl(entry.id)}
                alt=""
                style={{ width: 32, height: 32, imageRendering: "pixelated" }}
              />
              <Typography variant="body2">{entry.displayName}</Typography>
            </Box>
          ))}
          {!listLoading && !listError && searchQuery.trim().length > 0 && searchResults.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 0.5 }}>
              No Pokémon found.
            </Typography>
          )}
          {!listLoading && !listError && searchQuery.trim().length === 0 && (
            <Typography variant="caption" color="text.disabled" sx={{ px: 1, display: "block", pt: 0.5 }}>
              Type to search for a Pokémon
            </Typography>
          )}
        </Box>

        {saveError && (
          <Alert severity="error" sx={{ mt: 1.5 }}>{saveError}</Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} /> : undefined}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeckPickerDialog;
