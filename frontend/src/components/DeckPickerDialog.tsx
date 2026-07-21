import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import DeckPicker from "./DeckPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  initialPokemon1: number | null;
  initialPokemon2: number | null;
  onSave: (p1: number | null, p2: number | null) => Promise<void>;
}

const DeckPickerDialog: React.FC<Props> = ({
  open,
  onClose,
  initialPokemon1,
  initialPokemon2,
  onSave,
}) => {
  const [pokemon1, setPokemon1] = useState<number | null>(null);
  const [pokemon2, setPokemon2] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset to the saved selection each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setPokemon1(initialPokemon1);
    setPokemon2(initialPokemon2);
    setSaveError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    setSaveError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Choose your Pokémon</DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* key remounts the picker on each open so its active-slot state resets */}
        <DeckPicker
          key={open ? "open" : "closed"}
          pokemon1={pokemon1}
          pokemon2={pokemon2}
          onChange={(p1, p2) => { setPokemon1(p1); setPokemon2(p2); }}
        />

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
