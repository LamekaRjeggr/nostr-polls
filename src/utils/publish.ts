import { Event } from "nostr-tools";
import { pool, nostrRuntime } from "../singletons";
import { getNip65InboxRelays } from "../nostr/OutboxService";

const PUBLISH_TIMEOUT_MS = 5000;

export interface RelayPublishResult {
  relay: string;
  status: "accepted" | "rejected" | "timeout";
  /** Rejection reason from the relay, or undefined on success/timeout */
  message?: string;
  /** Milliseconds from publish start to relay response */
  latencyMs: number;
}

export interface PublishResult {
  ok: boolean;
  accepted: number;
  total: number;
  /** Per-relay breakdown for diagnostic display */
  relayResults: RelayPublishResult[];
}

async function attemptPublish(
  relays: string[],
  event: Event,
  globalStart: number,
): Promise<RelayPublishResult[]> {
  const promises = pool.publish(relays, event);
  return Promise.all(
    promises.map((p, i) => {
      const relayStart = Date.now();
      const remaining = PUBLISH_TIMEOUT_MS - (Date.now() - globalStart);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), Math.max(remaining, 500))
      );
      return Promise.race([p, timeout])
        .then((msg): RelayPublishResult => ({
          relay: relays[i],
          status: "accepted",
          message: msg || undefined,
          latencyMs: Date.now() - relayStart,
        }))
        .catch((err): RelayPublishResult => {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            relay: relays[i],
            status: msg === "timeout" ? "timeout" : "rejected",
            message: msg === "timeout" ? undefined : msg,
            latencyMs: Date.now() - relayStart,
          };
        });
    })
  );
}

export async function waitForPublish(
  relays: string[],
  event: Event
): Promise<PublishResult> {
  const total = relays.length;
  if (total === 0) return { ok: false, accepted: 0, total: 0, relayResults: [] };

  const globalStart = Date.now();
  let relayResults = await attemptPublish(relays, event, globalStart);

  // If every relay failed with a websocket error (dead connections, not relay
  // rejections), trigger a reconnect and retry once. This handles the case
  // where the OS killed WebSocket connections while the app was backgrounded.
  const allWebsocketErrors = relayResults.every(
    (r) => r.status === "rejected" && r.message?.toLowerCase().includes("websocket")
  );
  if (allWebsocketErrors) {
    nostrRuntime.reconnect();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    relayResults = await attemptPublish(relays, event, globalStart);
  }

  const accepted = relayResults.filter((r) => r.status === "accepted").length;
  return { ok: accepted > 0, accepted, total, relayResults };
}

/**
 * Publish an event using the gossip/outbox model.
 *
 * In addition to publishing to the user's own write relays, this delivers
 * the event to the NIP-65 read (inbox) relays of any pubkey mentioned via
 * a "p" tag. This ensures mentions actually reach the intended recipients
 * even if they don't share relays with the author.
 *
 * @param writeRelays - The logged-in user's write (outbox) relays
 * @param event       - The signed event to publish
 */
export async function publishWithGossip(
  writeRelays: string[],
  event: Event
): Promise<PublishResult> {
  // Collect pubkeys from p-tags (mentions)
  const mentionedPubkeys = event.tags
    .filter((t) => t[0] === "p" && t[1])
    .map((t) => t[1]);

  // Resolve inbox relays for each mentioned pubkey in parallel
  let inboxRelays: string[] = [];
  if (mentionedPubkeys.length > 0) {
    const settled = await Promise.allSettled(
      mentionedPubkeys.map((pk) => getNip65InboxRelays(pk))
    );
    inboxRelays = settled
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => (r as PromiseFulfilledResult<string[]>).value);
  }

  // Merge user's write relays + recipients' inbox relays, deduplicated
  const allRelays = Array.from(new Set([...writeRelays, ...inboxRelays]));

  return waitForPublish(allRelays, event);
}
