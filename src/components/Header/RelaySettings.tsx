import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import RefreshIcon from "@mui/icons-material/Refresh";
import SyncIcon from "@mui/icons-material/Sync";
import EditIcon from "@mui/icons-material/Edit";
import { useEffect, useState } from "react";
import { RelayEditor } from "./RelayEditor";
import { useUserContext } from "../../hooks/useUserContext";
import { useRelays } from "../../hooks/useRelays";
import { nostrRuntime } from "../../singletons";
import { useRelayHealth } from "../../contexts/RelayHealthContext";
import {
  getCachedGossipRelays,
  GossipRelayEntry,
} from "../../nostr/OutboxService";

function isRelayActive(url: string, activeRelays: Set<string>): boolean {
  const norm = url.replace(/\/$/, "");
  return (
    activeRelays.has(url) ||
    activeRelays.has(norm) ||
    activeRelays.has(norm + "/")
  );
}

function RelayTable({
  urls,
  activeRelays,
  extraCell,
}: {
  urls: string[];
  activeRelays: Set<string>;
  extraCell?: (url: string) => React.ReactNode;
}) {
  if (urls.length === 0)
    return (
      <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
        None configured
      </Typography>
    );
  return (
    <Table size="small">
      <TableBody>
        {urls.map((url) => (
          <TableRow key={url}>
            <TableCell sx={{ width: 32, pl: 0 }}>
              <Tooltip title={isRelayActive(url, activeRelays) ? "Active" : "Inactive"}>
                <LightbulbIcon
                  sx={{
                    fontSize: 18,
                    color: isRelayActive(url, activeRelays) ? "success.main" : "error.main",
                  }}
                />
              </Tooltip>
            </TableCell>
            <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem", wordBreak: "break-all" }}>
              {url}
            </TableCell>
            {extraCell && <TableCell sx={{ width: 80 }}>{extraCell(url)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function GossipRelayTable({
  entries,
  activeRelays,
}: {
  entries: GossipRelayEntry[];
  activeRelays: Set<string>;
}) {
  if (entries.length === 0)
    return (
      <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
        None discovered yet — gossip relays appear as you browse content
      </Typography>
    );
  return (
    <Table size="small">
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.url}>
            <TableCell sx={{ width: 32, pl: 0 }}>
              <Tooltip title={isRelayActive(entry.url, activeRelays) ? "Active" : "Inactive"}>
                <LightbulbIcon
                  sx={{
                    fontSize: 18,
                    color: isRelayActive(entry.url, activeRelays) ? "success.main" : "error.main",
                  }}
                />
              </Tooltip>
            </TableCell>
            <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all" }}>
              <Box>{entry.url}</Box>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5, alignItems: "center" }}>
                {entry.modes.has("write") && (
                  <Chip label="outbox" size="small" color="primary" variant="outlined" sx={{ fontSize: "0.6rem", height: 16 }} />
                )}
                {entry.modes.has("read") && (
                  <Chip label="inbox" size="small" color="secondary" variant="outlined" sx={{ fontSize: "0.6rem", height: 16 }} />
                )}
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                  {entry.pubkeyCount} user{entry.pubkeyCount !== 1 ? "s" : ""}
                </Typography>
              </Box>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export const RelaySettings: React.FC = () => {
  const [activeRelays, setActiveRelays] = useState<Set<string>>(new Set());
  const [gossipRelays, setGossipRelays] = useState<GossipRelayEntry[]>([]);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const { relays, writeRelays, isUsingUserRelays } = useRelays();
  const { user } = useUserContext();
  const { reconnect } = useRelayHealth();

  const refresh = () => {
    setActiveRelays(nostrRuntime.getActiveRelays());
    setGossipRelays(getCachedGossipRelays(user?.pubkey));
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [relays, writeRelays, user?.pubkey]); // eslint-disable-line react-hooks/exhaustive-deps

  const ownSet = Array.from(new Set([...relays, ...writeRelays]));
  const totalOwn = ownSet.length;
  const activeOwn = ownSet.filter((u) => isRelayActive(u, activeRelays)).length;
  const activeGossip = gossipRelays.filter((e) => isRelayActive(e.url, activeRelays)).length;

  if (editing) {
    return <RelayEditor onDone={() => setEditing(false)} />;
  }

  return (
    <Box>
      {/* Header row */}
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            label={isUsingUserRelays ? "Your Relay List (NIP-65)" : "Default Relays"}
            color={isUsingUserRelays ? "success" : "default"}
            size="small"
          />
          <Typography variant="caption" color="text.secondary">
            {activeOwn}/{totalOwn} own · {activeGossip}/{gossipRelays.length} gossip
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {user && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          )}
          <Button
            size="small"
            variant="contained"
            onClick={async () => {
              setIsReconnecting(true);
              reconnect();
              setTimeout(() => { refresh(); setIsReconnecting(false); }, 600);
            }}
            disabled={isReconnecting}
            startIcon={isReconnecting ? <CircularProgress size={14} /> : <SyncIcon />}
          >
            Reconnect
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={refresh}
            startIcon={<RefreshIcon />}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Read relays */}
      <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
        Read relays
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          (subscriptions)
        </Typography>
      </Typography>
      <RelayTable urls={relays} activeRelays={activeRelays} />

      {/* Write relays */}
      <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, fontWeight: 600 }}>
        Write relays
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          (publishing)
        </Typography>
      </Typography>
      <RelayTable urls={writeRelays} activeRelays={activeRelays} />

      {/* Gossip relays */}
      <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, fontWeight: 600 }}>
        Gossip relays
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          (NIP-65 discovered from other users)
        </Typography>
      </Typography>
      <GossipRelayTable entries={gossipRelays} activeRelays={activeRelays} />
    </Box>
  );
};
