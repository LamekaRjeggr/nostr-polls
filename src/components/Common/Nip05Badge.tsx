import React from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import VerifiedIcon from "@mui/icons-material/Verified";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useNip05 } from "../../hooks/useNip05";

interface Nip05BadgeProps {
  nip05: string | undefined;
  pubkey: string;
  /** Typography variant for the identifier text. Defaults to "caption". */
  variant?: "caption" | "body2" | "body1";
}

/**
 * Returns the display string for a NIP-05 identifier.
 * `_@domain.com` (root identity) → `domain.com`
 * `user@domain.com` → `user@domain.com`
 */
function formatNip05(identifier: string): string {
  if (identifier.startsWith("_@")) return identifier.slice(2);
  return identifier;
}

/**
 * Displays a NIP-05 identifier with:
 * - blue verified checkmark if the identifier resolves to the pubkey
 * - warning icon if verification failed
 * - nothing while still loading
 * `_@domain` identifiers are shown as just the domain.
 */
export const Nip05Badge: React.FC<Nip05BadgeProps> = ({
  nip05: identifier,
  pubkey,
  variant = "caption",
}) => {
  const status = useNip05(identifier, pubkey);

  if (!identifier) return null;

  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5, minWidth: 0 }}>
      {status === "verified" && (
        <Tooltip title="NIP-05 verified">
          <VerifiedIcon sx={{ fontSize: 14, color: "primary.main", mt: "2px", flexShrink: 0 }} />
        </Tooltip>
      )}
      {status === "failed" && (
        <Tooltip title="NIP-05 could not be verified">
          <WarningAmberIcon sx={{ fontSize: 14, color: "warning.main", mt: "2px", flexShrink: 0 }} />
        </Tooltip>
      )}
      <Typography variant={variant} color="text.secondary" sx={{ wordBreak: "break-all" }}>
        {formatNip05(identifier)}
      </Typography>
    </Box>
  );
};
