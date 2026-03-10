import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { nostrRuntime } from "../singletons";
import { useRelays } from "../hooks/useRelays";

interface RelayHealthState {
  connected: number;
  total: number;
}

const RelayHealthContext = createContext<RelayHealthState>({
  connected: 0,
  total: 0,
});

export const useRelayHealth = () => useContext(RelayHealthContext);

/**
 * Any relay URL that has at least one active subscription is treated as
 * "connected". This is a reliable proxy since subscriptions only survive on
 * open WebSocket connections in nostr-tools SimplePool.
 */
function getActiveConnectionStatus(relays: string[]): RelayHealthState {
  const activeRelays = nostrRuntime.getActiveRelays();
  let connected = 0;
  for (const url of relays) {
    // Normalise trailing slash differences
    const normalised = url.replace(/\/$/, "");
    if (
      activeRelays.has(url) ||
      activeRelays.has(normalised) ||
      activeRelays.has(normalised + "/")
    ) {
      connected++;
    }
  }
  return { connected, total: relays.length };
}

export const RelayHealthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { relays } = useRelays();
  const [health, setHealth] = useState<RelayHealthState>({
    connected: 0,
    total: relays.length,
  });
  const relaysRef = useRef(relays);
  relaysRef.current = relays;

  const refresh = useCallback(() => {
    setHealth(getActiveConnectionStatus(relaysRef.current));
  }, []);

  useEffect(() => {
    // Poll active subscriptions — no network cost, no new connections.
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, [relays, refresh]);

  return (
    <RelayHealthContext.Provider value={health}>
      {children}
    </RelayHealthContext.Provider>
  );
};
