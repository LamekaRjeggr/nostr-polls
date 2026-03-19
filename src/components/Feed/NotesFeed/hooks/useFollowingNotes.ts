import { useState, useRef, useCallback, useEffect } from "react";
import { Event, Filter } from "nostr-tools";
import { useRelays } from "../../../../hooks/useRelays";
import { nostrRuntime } from "../../../../singletons";
import { useUserContext } from "../../../../hooks/useUserContext";
import { getRelaysForAuthors, prefetchOutboxRelays } from "../../../../nostr/OutboxService";

export const useFollowingNotes = () => {
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [version, setVersion] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const missingNotesRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  const { relays } = useRelays();
  const { user } = useUserContext();

  const notes = useCallback(() => {
    if (!user?.follows?.length) return new Map<string, Event>();
    const events = nostrRuntime.query({
      kinds: [1],
      authors: Array.from(user.follows),
    });
    const noteMap = new Map<string, Event>();
    for (const event of events) noteMap.set(event.id, event);
    return noteMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.follows, version]);

  const reposts = useCallback(() => {
    if (!user?.follows?.length) return new Map<string, Event[]>();
    const events = nostrRuntime.query({
      kinds: [6],
      authors: Array.from(user.follows),
    });
    const repostMap = new Map<string, Event[]>();
    for (const event of events) {
      const originalNoteId = event.tags.find((t) => t[0] === "e")?.[1];
      if (originalNoteId) {
        const existing = repostMap.get(originalNoteId) || [];
        if (!existing.find((e) => e.id === event.id)) {
          repostMap.set(originalNoteId, [...existing, event]);
        }
      }
    }
    return repostMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.follows, version]);

  // Poll for newer notes every 60s after initial load; buffer via pendingCount
  useEffect(() => {
    if (!user?.follows?.length || !relays?.length) return;

    const poll = () => {
      if (!initialLoadDoneRef.current) return;
      const authors = Array.from(user.follows!);
      const currentEvents = nostrRuntime.query({ kinds: [1], authors });
      if (!currentEvents.length) return;
      const since = Math.max(...currentEvents.map((e) => e.created_at));
      const gossipRelays = getRelaysForAuthors(relays, authors);
      const handle = nostrRuntime.subscribe(
        gossipRelays,
        [{ kinds: [1], authors, since: since + 1, limit: 20 }],
        {
          onEvent: () => setPendingCount((c) => c + 1),
          onEose: () => handle.unsubscribe(),
        }
      );
    };

    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.follows, relays]);

  const mergeNewNotes = useCallback(() => {
    setVersion((v) => v + 1);
    setPendingCount(0);
  }, []);

  // Fetch the original notes for any reposts in one shot, no polling loop
  const startMissingNotesFetcher = useCallback(() => {
    const idsToFetch = Array.from(missingNotesRef.current);
    missingNotesRef.current.clear();
    if (!idsToFetch.length || !relays?.length) return;

    const authors = user?.follows ? Array.from(user.follows) : [];
    const gossipRelays = authors.length > 0 ? getRelaysForAuthors(relays, authors) : relays;

    nostrRuntime
      .querySync(gossipRelays, { kinds: [1], ids: idsToFetch })
      .then((events) => {
        if (events.length > 0) setVersion((v) => v + 1);
      });
  }, [relays, user?.follows]);

  // Load older notes (pagination down) or initial load
  const fetchNotes = useCallback(async (fresh?: boolean) => {
    if (!user?.follows?.length || loadingMore) return;
    if (fresh) setRefreshing(true); else setLoadingMore(true);
    const authors = Array.from(user.follows);

    prefetchOutboxRelays(authors); // fire-and-forget, populates cache for gossip model
    const gossipRelays = getRelaysForAuthors(relays, authors);

    const noteFilter: Filter = { kinds: [1], authors, limit: 10 };
    // On a fresh refresh, don't use `until` — fetch the latest from network
    if (!fresh) {
      const currentNotes = notes();
      if (currentNotes.size > 0) {
        noteFilter.until = Array.from(currentNotes.values()).sort(
          (a, b) => a.created_at - b.created_at
        )[0].created_at;
      }
    }

    const repostFilter: Filter = { kinds: [6], authors, limit: 10 };
    if (!fresh) {
      const currentReposts = reposts();
      if (currentReposts.size > 0) {
        const oldestRepostTime = Math.min(
          ...Array.from(currentReposts.values()).flat().map((r) => r.created_at)
        );
        repostFilter.until = oldestRepostTime;
      }
    }

    let hasNewEvents = false;
    const handle = nostrRuntime.subscribe(gossipRelays, [noteFilter, repostFilter], {
      onEvent: (event: Event) => {
        if (event.kind === 6) {
          const originalNoteId = event.tags.find((t) => t[0] === "e")?.[1];
          if (originalNoteId) missingNotesRef.current.add(originalNoteId);
        }
        hasNewEvents = true;
      },
      onEose: () => {
        handle.unsubscribe();
        if (hasNewEvents) setVersion((v) => v + 1);
        startMissingNotesFetcher();
        setLoadingMore(false);
        setRefreshing(false);
        initialLoadDoneRef.current = true;
      },
      fresh,
    });
  }, [user?.follows, relays, loadingMore, notes, reposts, startMissingNotesFetcher]);

  const refreshNotes = useCallback(() => {
    initialLoadDoneRef.current = false;
    missingNotesRef.current.clear();
    setVersion(0);
    setPendingCount(0);
    fetchNotes(true);
  }, [fetchNotes]);

  return {
    notes: notes(),
    reposts: reposts(),
    fetchNotes,
    refreshNotes,
    loadingMore,
    refreshing,
    pendingCount,
    mergeNewNotes,
  };
};
