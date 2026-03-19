import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { ReportReason } from "../../contexts/reports-context";
import { useBackClose } from "../../hooks/useBackClose";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "nudity", label: "Nudity / Explicit content" },
  { value: "profanity", label: "Profanity / Hateful speech" },
  { value: "illegal", label: "Illegal content" },
  { value: "impersonation", label: "Impersonation" },
  { value: "malware", label: "Malware" },
  { value: "other", label: "Other" },
];

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: ReportReason, content: string) => void;
  title?: string;
}

export function ReportDialog({
  open,
  onClose,
  onSubmit,
  title = "Report",
}: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [content, setContent] = useState("");
  useBackClose(open, onClose);

  const handleSubmit = () => {
    onSubmit(reason, content);
    setReason("spam");
    setContent("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          This report will be published as a NIP-56 kind 1984 event to your
          relays.
        </Typography>
        <FormControl>
          <RadioGroup
            value={reason}
            onChange={(e) => setReason(e.target.value as ReportReason)}
          >
            {REASONS.map((r) => (
              <FormControlLabel
                key={r.value}
                value={r.value}
                control={<Radio size="small" />}
                label={r.label}
              />
            ))}
          </RadioGroup>
        </FormControl>
        <TextField
          fullWidth
          multiline
          rows={2}
          placeholder="Additional context (optional)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          sx={{ mt: 2 }}
          size="small"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} color="error" variant="contained">
          Report
        </Button>
      </DialogActions>
    </Dialog>
  );
}
