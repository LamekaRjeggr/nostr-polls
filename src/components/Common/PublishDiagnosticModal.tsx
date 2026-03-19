import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import TimerOffIcon from "@mui/icons-material/TimerOff";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import ReplayIcon from "@mui/icons-material/Replay";
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
  /** Called with a relay URL to retry just that relay, or undefined to retry all failed. */
  onRetry?: (relay?: string) => Promise<DiagnosticEntry[]>;
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
  const [currentEntries, setCurrentEntries] = useState<DiagnosticEntry[]>(entries);
  // Set of relay URLs currently being retried
  const [retryingRelays, setRetryingRelays] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCurrentEntries(entries);
  }, [entries]);

  const isRetrying = retryingRelays.size > 0;

  const handleRetry = async (relay?: string) => {
    if (!onRetry) return;
    const targets = relay
      ? [relay]
      : currentEntries.filter((e) => e.status !== "accepted" && e.status !== "sent").map((e) => e.relay);
    if (targets.length === 0) return;

    setRetryingRelays((prev) => new Set(Array.from(prev).concat(targets)));
    try {
      const updated = await onRetry(relay);
      setCurrentEntries(updated);
    } finally {
      setRetryingRelays((prev) => {
        const next = new Set(prev);
        targets.forEach((r) => next.delete(r));
        return next;
      });
    }
  };

  const accepted = currentEntries.filter((e) => e.status === "accepted" || e.status === "sent").length;
  const failed = currentEntries.filter((e) => e.status === "rejected" || e.status === "failed").length;
  const timedOut = currentEntries.filter((e) => e.status === "timeout").length;
  const retryable = currentEntries.filter((e) => e.status !== "accepted" && e.status !== "sent").length;

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
              {onRetry && <TableCell sx={{ width: 36 }} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {currentEntries.map((e) => {
              const isFailed = e.status !== "accepted" && e.status !== "sent";
              const isRowRetrying = retryingRelays.has(e.relay);
              return (
                <TableRow key={e.relay}>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {hostname(e.relay)}
                  </TableCell>
                  <TableCell>
                    {isRowRetrying ? (
                      <CircularProgress size={16} />
                    ) : (
                      <StatusChip status={e.status} />
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem", color: e.latencyMs !== undefined && e.latencyMs > 2000 ? "warning.main" : "text.secondary" }}>
                    {e.latencyMs !== undefined ? (e.latencyMs < 1000 ? `${e.latencyMs}ms` : `${(e.latencyMs / 1000).toFixed(1)}s`) : "—"}
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                    {e.message || "no reason provided"}
                  </TableCell>
                  {onRetry && (
                    <TableCell sx={{ p: 0 }}>
                      {isFailed && (
                        <Tooltip title="Retry this relay">
                          <span>
                            <IconButton
                              size="small"
                              disabled={isRowRetrying || isRetrying}
                              onClick={() => handleRetry(e.relay)}
                            >
                              {isRowRetrying ? <CircularProgress size={14} /> : <ReplayIcon sx={{ fontSize: 16 }} />}
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
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
        {onRetry && retryable > 1 && (
          <Button
            onClick={() => handleRetry()}
            color="primary"
            disabled={isRetrying}
            startIcon={isRetrying ? <CircularProgress size={16} /> : undefined}
          >
            {isRetrying ? "Retrying…" : `Retry all ${retryable} failed`}
          </Button>
        )}
        <Button onClick={onClose} disabled={isRetrying}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
