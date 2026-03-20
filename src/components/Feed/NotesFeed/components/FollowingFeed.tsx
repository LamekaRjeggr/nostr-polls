import { useEffect, useMemo } from "react";
import { Button } from "@mui/material";
import { useUserContext } from "../../../../hooks/useUserContext";
import RepostsCard from "./RepostedNoteCard";
import { useFollowingNotes } from "../hooks/useFollowingNotes";
import type { NoteMode } from "./index";
import UnifiedFeed from "../../UnifiedFeed";
import { useReports } from "../../../../hooks/useReports";

const isRootNote = (event: { tags: string[][] }) =>
  !event.tags.some((t) => t[0] === "e");

const FollowingFeed = ({
  noteMode,
  onRegisterRefresh,
}: {
  noteMode: NoteMode;
  onRegisterRefresh?: (fn: () => void) => void;
}) => {
  const { user, requestLogin } = useUserContext();
  const { notes, reposts, fetchNotes, refreshNotes, checkForNewer, loadingMore, refreshing, pendingCount, mergeNewNotes } =
    useFollowingNotes();

  // Register refresh with parent header button
  useEffect(() => {
    onRegisterRefresh?.(refreshNotes);
  }, [onRegisterRefresh, refreshNotes]);
  const { requestReportCheck, requestUserReportCheck } = useReports();

  // Merge notes and reposts for sorting by created_at
  // Each item: { note: Event, reposts: Event[] }
  const mergedNotes = useMemo(() => {
    return Array.from(notes.values())
      .filter((note) =>
        noteMode === "notes" ? isRootNote(note) : !isRootNote(note)
      )
      .map((note) => {
        const noteReposts = reposts.get(note.id) || [];
        const latestRepostTime = noteReposts.length
          ? Math.max(...noteReposts.map((r) => r.created_at))
          : 0;

        const latestActivity = Math.max(note.created_at, latestRepostTime);

        return {
          note,
          reposts: noteReposts,
          latestActivity,
        };
      })
      .sort((a, b) => b.latestActivity - a.latestActivity);
  }, [notes, reposts, noteMode]);

  // Fetch WoT reports for the current batch of visible note ids and their authors
  useEffect(() => {
    if (mergedNotes.length > 0) {
      requestReportCheck(mergedNotes.map((m) => m.note.id));
      requestUserReportCheck(mergedNotes.map((m) => m.note.pubkey));
    }
  }, [mergedNotes, requestReportCheck, requestUserReportCheck]);

  useEffect(() => {
    if (user) {
      fetchNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          margin: 10,
        }}
      >
        <Button variant="contained" onClick={requestLogin}>
          login to view feed
        </Button>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <UnifiedFeed
        data={mergedNotes}
        loading={loadingMore && mergedNotes.length === 0}
        followOutput={false}
        onEndReached={fetchNotes}
        onRefreshNewer={checkForNewer}
        onRefresh={refreshNotes}
        refreshing={refreshing}
        computeItemKey={(_, item) => item.note.id}
        newItemCount={pendingCount}
        onShowNewItems={mergeNewNotes}
        newItemLabel="notes"
        itemContent={(index, item) => (
          <RepostsCard
            note={item.note}
            reposts={reposts.get(item.note.id) || []}
          />
        )}
      />
    </div>
  );
};

export default FollowingFeed;
