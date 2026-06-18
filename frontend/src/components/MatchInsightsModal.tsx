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
  Typography,
} from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { supabase } from "../supabaseClient";
import {
  getArtworkUrl,
  getPokemonList,
  getSpriteUrl,
  type PokemonEntry,
} from "../utils/pokemonCache";

// ── Inline Pokemon slot (read-only display) ───────────────────────────────────

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
        minHeight: 80,
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
        p: 1,
        "&:hover": { borderColor: "primary.main" },
      }}
    >
      <Typography variant="caption" sx={{ color: "text.secondary", position: "absolute", top: 4, left: 8, fontSize: "0.65rem" }}>
        {label}
      </Typography>
      {pokemonId ? (
        <>
          <img src={getArtworkUrl(pokemonId)} alt={pokemonName ?? ""} style={{ width: 48, height: 48, objectFit: "contain" }} />
          <Typography variant="caption" sx={{ mt: 0.25 }}>{pokemonName}</Typography>
          <Box
            component="span"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            sx={{
              position: "absolute", top: 2, right: 6,
              cursor: "pointer", fontSize: "0.7rem", color: "text.disabled",
              "&:hover": { color: "text.secondary" },
            }}
          >
            ✕
          </Box>
        </>
      ) : (
        <Typography variant="caption" color="text.disabled">Empty</Typography>
      )}
    </Box>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  matchId: string;
  opponentPrefilledPokemon1: number | null;
  opponentPrefilledPokemon2: number | null;
  onClose: () => void;
  onDismiss: () => void;
}

// ── Main component ─────────────────────────────────────────────────────────────

const MatchInsightsModal: React.FC<Props> = ({
  open,
  matchId,
  opponentPrefilledPokemon1,
  opponentPrefilledPokemon2,
  onClose,
  onDismiss,
}) => {
  const [wentFirst, setWentFirst] = useState<boolean | null>(null);
  const [oppP1, setOppP1] = useState<number | null>(null);
  const [oppP2, setOppP2] = useState<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<1 | 2>(1);
  const [search, setSearch] = useState("");
  const [allPokemon, setAllPokemon] = useState<PokemonEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefilledNote, setPrefilledNote] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWentFirst(null);
    setError(null);
    setSearch("");

    const hadPrefill = opponentPrefilledPokemon1 != null || opponentPrefilledPokemon2 != null;
    setOppP1(opponentPrefilledPokemon1);
    setOppP2(opponentPrefilledPokemon2);
    setPrefilledNote(hadPrefill);
    setActiveSlot(hadPrefill ? 1 : 1);

    if (allPokemon.length > 0) return;
    setListLoading(true);
    getPokemonList()
      .then((list) => setAllPokemon(list))
      .catch(() => {/* silently ignore */})
      .finally(() => setListLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const getName = (id: number | null) =>
    id == null ? null : (allPokemon.find((p) => p.id === id)?.displayName ?? `#${id}`);

  const searchResults =
    search.trim().length > 0
      ? allPokemon
          .filter((p) => {
            const words = search.toLowerCase().trim().split(/\s+/);
            const name = p.displayName.toLowerCase();
            return words.every((w) => name.includes(w));
          })
          .slice(0, 3)
      : [];

  const handleSelect = (entry: PokemonEntry) => {
    if (activeSlot === 1) {
      setOppP1(entry.id);
      if (oppP2 == null) setActiveSlot(2);
    } else {
      setOppP2(entry.id);
    }
    setSearch("");
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("upsert_match_insights", {
      p_match_id: matchId,
      p_went_first: wentFirst,
      p_opp_pokemon1: oppP1,
      p_opp_pokemon2: oppP2,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onDismiss} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        Improve your stats
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Answer two quick questions to unlock richer stats — first/second win rates, matchup data, and more.
        </Typography>

        {/* Q1: went first */}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Did you go first or second?
        </Typography>
        <Box display="flex" gap={1.5} mb={3}>
          {([true, false] as const).map((v) => (
            <Button
              key={String(v)}
              variant={wentFirst === v ? "contained" : "outlined"}
              onClick={() => setWentFirst(v)}
              sx={{ flex: 1, py: 1.25 }}
            >
              {v ? "I went first" : "I went second"}
            </Button>
          ))}
        </Box>

        {/* Q2: opponent deck */}
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          What deck did your opponent play?
        </Typography>
        {prefilledNote && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Pre-filled from their entry — correct it if wrong.
          </Typography>
        )}

        <Box display="flex" gap={1} mb={1.5}>
          <PokemonSlot
            label="Slot 1"
            pokemonId={oppP1}
            pokemonName={getName(oppP1)}
            active={activeSlot === 1}
            onClick={() => setActiveSlot(1)}
            onClear={() => { setOppP1(null); setActiveSlot(1); }}
          />
          <PokemonSlot
            label="Slot 2"
            pokemonId={oppP2}
            pokemonName={getName(oppP2)}
            active={activeSlot === 2}
            onClick={() => setActiveSlot(2)}
            onClear={() => { setOppP2(null); setActiveSlot(2); }}
          />
        </Box>

        <input
          placeholder={`Search slot ${activeSlot}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%", padding: "6px 10px", boxSizing: "border-box",
            border: "1px solid #ccc", borderRadius: 4, fontSize: 14,
          }}
        />

        <Box mt={0.5} minHeight={40}>
          {listLoading && (
            <Box display="flex" justifyContent="center" py={1}>
              <CircularProgress size={18} />
            </Box>
          )}
          {!listLoading && searchResults.map((entry) => (
            <Box
              key={entry.id}
              onClick={() => handleSelect(entry)}
              sx={{
                display: "flex", alignItems: "center", gap: 1,
                px: 1, py: 0.5, cursor: "pointer", borderRadius: 1,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <img src={getSpriteUrl(entry.id)} alt="" style={{ width: 28, height: 28, imageRendering: "pixelated" }} />
              <Typography variant="body2">{entry.displayName}</Typography>
            </Box>
          ))}
          {!listLoading && search.trim().length > 0 && searchResults.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
              No Pokémon found.
            </Typography>
          )}
        </Box>

        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent>

      <DialogActions sx={{ px: 2, pb: 2, justifyContent: "space-between" }}>
        <Button onClick={onDismiss} color="inherit" size="small">
          Skip for now
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSubmit()}
          disabled={saving || wentFirst === null}
          endIcon={saving ? <CircularProgress size={14} /> : <ArrowForwardIcon />}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MatchInsightsModal;
