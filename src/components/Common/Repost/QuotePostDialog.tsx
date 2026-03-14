import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Collapse,
  Typography,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { Event, nip19 } from "nostr-tools";
import { useUserContext } from "../../../hooks/useUserContext";
import { useRelays } from "../../../hooks/useRelays";
import { useNotification } from "../../../contexts/notification-context";
import { signEvent } from "../../../nostr";
import { waitForPublish } from "../../../utils/publish";
import { extractHashtags } from "../../../utils/common";
import { NOSTR_EVENT_KINDS } from "../../../constants/nostr";
import MentionTextArea, {
  extractMentionTags,
} from "../../EventCreator/MentionTextArea";
import { NotePreview } from "../../EventCreator/NotePreview";
import { Notes } from "../../Notes";
import PollResponseForm from "../../PollResponse/PollResponseForm";

interface QuotePostDialogProps {
  open: boolean;
  onClose: () => void;
  event: Event;
}

const QuotePostDialog: React.FC<QuotePostDialogProps> = ({
  open,
  onClose,
  event,
}) => {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { user } = useUserContext();
  const { relays } = useRelays();
  const { showNotification } = useNotification();

  const neventId = useMemo(() => {
    if (!event.id || event.id.length !== 64 || !/^[0-9a-f]+$/i.test(event.id)) {
      return null;
    }
    try {
      return nip19.neventEncode({
        id: event.id,
        relays: relays.slice(0, 2),
        kind: event.kind,
      });
    } catch {
      return null;
    }
  }, [event.id, event.kind, relays]);

  const handleSubmit = async () => {
    if (!user || !neventId) return;

    const fullContent = content.trim()
      ? `${content}\n\nnostr:${neventId}`
      : `nostr:${neventId}`;

    const mentionTags = extractMentionTags(content);
    const hashtagTags = extractHashtags(content).map((t) => ["t", t]);

    const noteEvent = {
      kind: NOSTR_EVENT_KINDS.TEXT_NOTE,
      content: fullContent,
      tags: [
        ["q", event.id, relays[0] || ""],
        ["p", event.pubkey],
        ...mentionTags,
        ...hashtagTags,
      ],
      created_at: Math.floor(Date.now() / 1000),
    };

    try {
      setIsSubmitting(true);
      const signedEvent = await signEvent(noteEvent, user.privateKey);
      if (!signedEvent) {
        showNotification("Failed to sign quote post", "error");
        return;
      }
      const result = await waitForPublish(relays, signedEvent);
      if (result.ok) {
        showNotification(`Quote post published to ${result.accepted}/${result.total} relays`, "success");
        setContent("");
        onClose();
      } else {
        showNotification("No relays accepted your quote post", "error");
      }
    } catch (error) {
      console.error("Error publishing quote post:", error);
      showNotification("Failed to publish quote post", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setContent("");
      setShowPreview(false);
      onClose();
    }
  };

  const previewEvent = useMemo(() => ({
    content: content.trim() ? `${content}\n\nnostr:${neventId}` : "",
    tags: [],
  }), [content, neventId]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Quote Post</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <MentionTextArea
            label="Add your commentary"
            value={content}
            onChange={setContent}
            placeholder="Write something about this post..."
            minRows={3}
            maxRows={6}
          />
        </Box>

        <Button
          size="small"
          variant="text"
          startIcon={showPreview ? <VisibilityOffIcon /> : <VisibilityIcon />}
          onClick={() => setShowPreview((v) => !v)}
          sx={{ mt: 1 }}
        >
          {showPreview ? "Hide Preview" : "Preview"}
        </Button>

        <Collapse in={showPreview}>
          <NotePreview noteEvent={previewEvent} />
        </Collapse>

        {neventId ? (
          <Box
            sx={{
              mt: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              overflow: "hidden",
              opacity: 0.85,
              pointerEvents: "none",
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, pt: 1, display: "block" }}>
              Quoting:
            </Typography>
            {event.kind === NOSTR_EVENT_KINDS.POLL ? (
              <PollResponseForm pollEvent={event} />
            ) : (
              <Notes event={event} />
            )}
          </Box>
        ) : (
          <Typography color="error" sx={{ mt: 2 }}>
            Unable to load post preview
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting || !neventId}
        >
          {isSubmitting ? "Publishing..." : "Quote Post"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default QuotePostDialog;
