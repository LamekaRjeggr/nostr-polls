import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import TimerOffIcon from "@mui/icons-material/TimerOff";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import { useBackClose } from "../../hooks/useBackClose";

export type DiagnosticRelayStatus = "accepted" | "sent" | "rejected" | "failed" | "timeout" | "pending";

export interface DiagnosticEntry {
  relay: string;
  status: DiagnosticRelayStatus;
  message?: string;
  latencyMs?: number;
}

interface PublishDiagnosticModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  entries: DiagnosticEntry[];
  onRetry?: () => void;
}

function hostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function StatusChip({ status }: { status: DiagnosticRelayStatus }) {
  if (status === "accepted" || status === "sent") {
    return (
      <Chip
        icon={<CheckCircleOutlineIcon />}
        label={status}
        size="small"
        color="success"
        variant="outlined"
        sx={{ fontSize: "0.7rem", height: 22 }}
      />
    );
  }
  if (status === "timeout") {
    return (
      <Chip
        icon={<TimerOffIcon />}
        label="timeout"
        size="small"
        color="warning"
        variant="outlined"
        sx={{ fontSize: "0.7rem", height: 22 }}
      />
    );
  }
  if (status === "pending") {
    return (
      <Chip
        icon={<HourglassEmptyIcon />}
        label="pending"
        size="small"
        variant="outlined"
        sx={{ fontSize: "0.7rem", height: 22 }}
      />
    );
  }
  return (
    <Chip
      icon={<ErrorOutlineIcon />}
      label={status}
      size="small"
      color="error"
      variant="outlined"
      sx={{ fontSize: "0.7rem", height: 22 }}
    />
  );
}

export const PublishDiagnosticModal: React.FC<PublishDiagnosticModalProps> = ({
  open,
  onClose,
  title = "Relay publish results",
  entries,
  onRetry,
}) => {
  useBackClose(open, onClose);
  const accepted = entries.filter((e) => e.status === "accepted" || e.status === "sent").length;
  const failed = entries.filter((e) => e.status === "rejected" || e.status === "failed").length;
  const timedOut = entries.filter((e) => e.status === "timeout").length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6">{title}</Typography>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {accepted > 0 && <Chip label={`${accepted} accepted`} size="small" color="success" />}
            {timedOut > 0 && <Chip label={`${timedOut} timeout`} size="small" color="warning" />}
            {failed > 0 && <Chip label={`${failed} rejected`} size="small" color="error" />}
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Relay</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", width: 110 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", width: 70 }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Reason</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.relay}>
                <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {hostname(e.relay)}
                </TableCell>
                <TableCell>
                  <StatusChip status={e.status} />
                </TableCell>
                <TableCell sx={{ fontSize: "0.75rem", color: e.latencyMs !== undefined && e.latencyMs > 2000 ? "warning.main" : "text.secondary" }}>
                  {e.latencyMs !== undefined ? (e.latencyMs < 1000 ? `${e.latencyMs}ms` : `${(e.latencyMs / 1000).toFixed(1)}s`) : "—"}
                </TableCell>
                <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                  {e.message || "no reason provided"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {timedOut > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
            Timed out after 5 s — relay may be slow, unreachable, or the connection dropped.
          </Typography>
        )}
        {failed > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            Rejected relays returned a negative OK response. The reason above is what the relay reported.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {onRetry && (
          <Button onClick={() => { onRetry(); onClose(); }} color="primary">
            Retry
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
