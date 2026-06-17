import { TextField } from "@mui/material";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: (value: string) => void;
}

export default function RoundNoteField({ value, onChange, onFocus, onBlur }: Props) {
  return (
    <TextField
      size="small"
      fullWidth
      placeholder="Add a note for players… (e.g. timer paused for judge call)"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={(e) => onBlur(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      inputProps={{ maxLength: 280 }}
      sx={{ mt: 1, mb: 0.5 }}
    />
  );
}
