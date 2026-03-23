import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  TextField,
  Box,
  LinearProgress,
  Radio,
  RadioGroup,
  FormControlLabel,
  Alert,
} from "@mui/material";
import dayjs from "dayjs";
import { NuanceOption } from "../../hooks/useNuanceOptions";

export type NuanceResult =
  | { type: "cosign"; eventId: string }
  | { type: "freeform"; text: string }
  | { type: "skip" };

interface NuanceStepProps {
  open: boolean;
  loading: boolean;
  nuanceOptions: NuanceOption[];
  /** Unix timestamp string from poll's endsAt tag */
  pollExpiration?: string;
  onSubmit: (nuance: NuanceResult) => void;
  /** Cancel the nuance step without voting */
  onCancel: () => void;
}

/** Seconds remaining before we auto-emit a vote without nuance */
const AUTO_EMIT_SECS = 30;

const NuanceStep: React.FC<NuanceStepProps> = ({
  open,
  loading,
  nuanceOptions,
  pollExpiration,
  onSubmit,
  onCancel,
}) => {
  // "cosign:<eventId>" | "custom" | ""
  const [selected, setSelected] = useState<string>("");
  const [customText, setCustomText] = useState("");
  const [secsLeft, setSecsLeft] = useState<number | null>(null);

  // Reset state each time the dialog opens
  useEffect(() => {
    if (open) {
      setSelected("");
      setCustomText("");
    }
  }, [open]);

  // Expiry countdown — auto-emit skip if time runs out
  useEffect(() => {
    if (!open || !pollExpiration) return;

    const update = () => {
      const s = dayjs.unix(Number(pollExpiration)).diff(dayjs(), "second");
      setSecsLeft(s);
      if (s <= 0) {
        onSubmit({ type: "skip" });
      }
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [open, pollExpiration]); // eslint-disable-line react-hooks/exhaustive-deps

  const isExpiring =
    secsLeft !== null && secsLeft > 0 && secsLeft <= AUTO_EMIT_SECS;

  const showCustomInput =
    selected === "custom" || (!loading && nuanceOptions.length === 0);

  const handleSubmit = () => {
    if (selected.startsWith("cosign:")) {
      onSubmit({ type: "cosign", eventId: selected.slice("cosign:".length) });
    } else if (showCustomInput && customText.trim()) {
      onSubmit({ type: "freeform", text: customText.trim() });
    } else {
      onSubmit({ type: "skip" });
    }
  };

  const canSubmitCustom = !showCustomInput || customText.trim().length > 0;

  return (
    <Dialog open={open} maxWidth="sm" fullWidth onClose={onCancel}>
      <DialogTitle>Add nuance to your vote (optional)</DialogTitle>

      <DialogContent>
        {isExpiring && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Poll closes in {secsLeft}s — your vote will be submitted
            automatically.
          </Alert>
        )}

        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {!loading && nuanceOptions.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Others who chose this option said:
            </Typography>
            <RadioGroup
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {nuanceOptions.map((opt) => (
                <FormControlLabel
                  key={opt.sourceEventId}
                  value={`cosign:${opt.sourceEventId}`}
                  control={<Radio size="small" />}
                  label={
                    <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography variant="body2">{opt.text}</Typography>
                      {opt.count > 1 && (
                        <Typography variant="caption" color="text.secondary">
                          ({opt.count})
                        </Typography>
                      )}
                    </Box>
                  }
                />
              ))}
              <FormControlLabel
                value="custom"
                control={<Radio size="small" />}
                label={<Typography variant="body2">Write my own…</Typography>}
              />
            </RadioGroup>
          </Box>
        )}

        {!loading && nuanceOptions.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No nuance yet. Be the first to add context to this option.
          </Typography>
        )}

        {showCustomInput && (
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Your nuance"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="What's your take on this option?"
            autoFocus
          />
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit({ type: "skip" })} color="secondary">
          Skip
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmitCustom}
        >
          Add &amp; Vote
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NuanceStep;
