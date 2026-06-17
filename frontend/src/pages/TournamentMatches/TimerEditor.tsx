import { Box, Button, IconButton, Switch, TextField, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

interface Props {
  durationMinutes: number | null | undefined;
  durationInput: string | null;
  setDurationInput: (v: string | null) => void;
  saving: boolean;
  onSetDuration: (minutes: number | null) => void;
  onClose: () => void;
}

export default function TimerEditor({
  durationMinutes,
  durationInput,
  setDurationInput,
  saving,
  onSetDuration,
  onClose,
}: Props) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
        mt: 1,
        mb: 1,
      }}
    >
      <Switch
        checked={!!durationMinutes}
        onChange={(e) => {
          if (e.target.checked) {
            onSetDuration(50);
          } else {
            onSetDuration(null);
          }
        }}
        disabled={saving}
        size="small"
      />
      <Typography variant="body2" color="text.secondary">
        Round timer
      </Typography>
      {!!durationMinutes && (
        <>
          <TextField
            type="number"
            size="small"
            label="Duration (minutes)"
            value={durationInput ?? durationMinutes.toString()}
            onChange={(e) => setDurationInput(e.target.value)}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              setDurationInput(null);
              if (!isNaN(v) && v >= 1 && v <= 180 && v !== durationMinutes) {
                onSetDuration(v);
              }
            }}
            onWheel={(e) => e.currentTarget.blur()}
            inputProps={{ min: 1, max: 180, step: 1 }}
            sx={{ width: 160 }}
            disabled={saving}
          />
          {([-10, -1, 1, 10] as const).map((delta) => {
            const next = (durationMinutes ?? 0) + delta;
            const disabled = saving || next < 1 || next > 180;
            return (
              <Button
                key={delta}
                size="small"
                variant="outlined"
                disabled={disabled}
                onClick={() => onSetDuration(next)}
                sx={{ minWidth: 0, px: 1 }}
              >
                {delta > 0 ? `+${delta}m` : `${delta}m`}
              </Button>
            );
          })}
        </>
      )}
      <Tooltip title="Close">
        <IconButton size="small" onClick={onClose}>
          <CloseIcon sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
