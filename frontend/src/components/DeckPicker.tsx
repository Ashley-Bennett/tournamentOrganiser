import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
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
  pokemon1: number | null;
  pokemon2: number | null;
  onChange: (p1: number | null, p2: number | null) => void;
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

// ── Picker ────────────────────────────────────────────────────────────────────
// Controlled slot + search UI shared by DeckPickerDialog (edit-after-join) and
// the tournament join page (pick-while-registering). The parent owns the two
// selected IDs; this component only drives selection and search.

const DeckPicker: React.FC<Props> = ({ pokemon1, pokemon2, onChange }) => {
  const [activeSlot, setActiveSlot] = useState<1 | 2>(pokemon1 == null ? 1 : pokemon2 == null ? 2 : 1);

  const [allPokemon, setAllPokemon] = useState<PokemonEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (allPokemon.length > 0) return; // already loaded

    setListLoading(true);
    setListError(null);
    getPokemonList()
      .then((list) => { setAllPokemon(list); })
      .catch(() => { setListError("Could not load Pokémon list."); })
      .finally(() => { setListLoading(false); });
  }, [allPokemon.length]);

  // Filter results — word-based so "mega absol" and "absol mega" both match
  // "Mega Absol", and "hisuian growlithe" matches "Hisuian Growlithe".
  const searchResults =
    searchQuery.trim().length > 0
      ? allPokemon
          .filter((p) => {
            const words = searchQuery.toLowerCase().trim().split(/\s+/);
            const name = p.displayName.toLowerCase();
            return words.every((w) => name.includes(w));
          })
          .slice(0, 3)
      : [];

  const getName = (id: number | null) =>
    id == null ? null : (allPokemon.find((p) => p.id === id)?.displayName ?? `#${id}`);

  const handleSelect = (entry: PokemonEntry) => {
    if (activeSlot === 1) {
      onChange(entry.id, pokemon2);
      // Auto-advance to slot 2 if it's empty
      if (pokemon2 == null) setActiveSlot(2);
    } else {
      onChange(pokemon1, entry.id);
    }
    setSearchQuery("");
  };

  return (
    <Box>
      {/* Slot row */}
      <Box display="flex" gap={1.5} mb={2}>
        <PokemonSlot
          label="Slot 1"
          pokemonId={pokemon1}
          pokemonName={getName(pokemon1)}
          active={activeSlot === 1}
          onClick={() => setActiveSlot(1)}
          onClear={() => { onChange(null, pokemon2); setActiveSlot(1); }}
        />
        <PokemonSlot
          label="Slot 2"
          pokemonId={pokemon2}
          pokemonName={getName(pokemon2)}
          active={activeSlot === 2}
          onClick={() => setActiveSlot(2)}
          onClear={() => { onChange(pokemon1, null); setActiveSlot(2); }}
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
    </Box>
  );
};

export default DeckPicker;
