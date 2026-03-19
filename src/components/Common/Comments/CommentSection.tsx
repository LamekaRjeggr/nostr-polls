import React, { useEffect, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Collapse,
  Box,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CellTowerIcon from "@mui/icons-material/CellTower";
import FlagIcon from "@mui/icons-material/Flag";
import { useAppContext } from "../../../hooks/useAppContext";
import { signEvent } from "../../../nostr";
import { useRelays } from "../../../hooks/useRelays";
import { Event, nip19 } from "nostr-tools";
import { DEFAULT_IMAGE_URL } from "../../../utils/constants";
import { useUserContext } from "../../../hooks/useUserContext";
import { TextWithImages } from "../Parsers/TextWithImages";
import { calculateTimeAgo } from "../../../utils/common";
import CommentInput from "./CommentInput";
import { extractMentionTags } from '../../EventCreator/MentionTextArea';
import { getColorsWithTheme } from "../../../styles/theme";
import { useNotification } from "../../../contexts/notification-context";
import { NOTIFICATION_MESSAGES } from "../../../constants/notifications";
import { pool, nostrRuntime } from "../../../singletons";
import { SubscriptionHandle } from "../../../nostrRuntime/types";
import { FeedbackMenu } from "../../FeedbackMenu";
import { RelaySourceModal } from "../RelaySourceModal";
import { useEventRelays } from "../../../hooks/useEventRelays";
import { useReports } from "../../../hooks/useReports";
import { ReportDialog } from "../../Report/ReportDialog";
import { ReportReason } from "../../../contexts/reports-context";
import { getAppBaseUrl } from "../../../utils/platform";

// ── Per-comment card with context menu ──────────────────────────────────────
interface CommentCardProps {
  comment: Event;
  depth: number;
  onReply: (id: string) => void;
  children?: React.ReactNode;
}

const CommentCard: React.FC<CommentCardProps> = ({ comment, depth, onReply, children }) => {
  const { profiles, fetchUserProfileThrottled } = useAppContext();
  const { user } = useUserContext();
  const eventRelays = useEventRelays(comment.id);
  const { reportEvent, reportUser } = useReports();

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [relayModalOpen, setRelayModalOpen] = useState(false);
  const [reportPostOpen, setReportPostOpen] = useState(false);
  const [reportUserOpen, setReportUserOpen] = useState(false);

  const commentUser = profiles?.get(comment.pubkey);
  if (!commentUser) fetchUserProfileThrottled(comment.pubkey);

  const handleCopyNevent = () => {
    navigator.clipboard.writeText(nip19.neventEncode({ id: comment.id }));
    setMenuAnchor(null);
  };
  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${getAppBaseUrl()}/note/${nip19.neventEncode({ id: comment.id })}`);
    setMenuAnchor(null);
  };
  const handleCopyNpub = () => {
    navigator.clipboard.writeText(nip19.npubEncode(comment.pubkey));
    setMenuAnchor(null);
  };

  const authorName =
    commentUser?.name ||
    (() => { const n = nip19.npubEncode(comment.pubkey); return n.slice(0, 10) + "..."; })();

  return (
    <>
      <Card variant="outlined" style={{ marginTop: "8px" }}>
        <CardHeader
          avatar={<Avatar src={commentUser?.picture || DEFAULT_IMAGE_URL} />}
          title={authorName}
          subheader={calculateTimeAgo(comment.created_at)}
          action={
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          }
        />
        <CardContent style={{ marginLeft: "8px", padding: "8px" }}>
          <Typography>
            <TextWithImages content={comment.content} tags={comment.tags} />
          </Typography>
        </CardContent>

        <Box sx={{ px: 1, pb: 1 }}>
          <FeedbackMenu event={comment} depth={depth + 1} />
        </Box>

        {children}
      </Card>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {eventRelays.length > 0 && (
          <MenuItem onClick={() => { setRelayModalOpen(true); setMenuAnchor(null); }} sx={{ gap: 1 }}>
            <CellTowerIcon fontSize="small" />
            Found on {eventRelays.length} relay{eventRelays.length !== 1 ? "s" : ""}
          </MenuItem>
        )}
        <MenuItem onClick={handleCopyNevent}>Copy Event Id</MenuItem>
        <MenuItem onClick={handleCopyLink}>Copy Link</MenuItem>
        <MenuItem onClick={handleCopyNpub}>Copy Author npub</MenuItem>
        {user && (
          <MenuItem onClick={() => { setMenuAnchor(null); setReportPostOpen(true); }} sx={{ color: "error.main" }}>
            <FlagIcon fontSize="small" sx={{ mr: 1 }} />
            Report post
          </MenuItem>
        )}
        {user && (
          <MenuItem onClick={() => { setMenuAnchor(null); setReportUserOpen(true); }} sx={{ color: "error.main" }}>
            <FlagIcon fontSize="small" sx={{ mr: 1 }} />
            Report user
          </MenuItem>
        )}
      </Menu>

      <RelaySourceModal open={relayModalOpen} onClose={() => setRelayModalOpen(false)} relays={eventRelays} />
      <ReportDialog
        open={reportPostOpen}
        onClose={() => setReportPostOpen(false)}
        onSubmit={(reason: ReportReason, content: string) => { reportEvent(comment.id, comment.pubkey, reason, content); setReportPostOpen(false); }}
        title="Report post"
      />
      <ReportDialog
        open={reportUserOpen}
        onClose={() => setReportUserOpen(false)}
        onSubmit={(reason: ReportReason, content: string) => { reportUser(comment.pubkey, reason, content); setReportUserOpen(false); }}
        title="Report user"
      />
    </>
  );
};

interface CommentSectionProps {
  eventId: string;
  showComments: boolean;
  depth?: number;
}

const CommentSection: React.FC<CommentSectionProps> = ({
  eventId,
  showComments,
  depth = 0,
}) => {
  const { showNotification } = useNotification();
  const {
    fetchCommentsThrottled,
    commentsMap,
    addEventToMap,
  } = useAppContext();

  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showReplies, setShowReplies] = useState<Map<string, boolean>>(
    new Map()
  );

  const { user } = useUserContext();
  const { relays } = useRelays();

  const fetchComments = () => {
    let filter = {
      kinds: [1],
      "#e": [eventId],
    };
    let handle = nostrRuntime.subscribe(relays, [filter], {
      onEvent: addEventToMap,
    });
    return handle;
  };

  useEffect(() => {
    let handle: SubscriptionHandle | undefined;
    if (!handle && showComments) {
      handle = fetchComments();
      return () => {
        if (handle) handle.unsubscribe();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showComments]);

  useEffect(() => {
    if (!commentsMap?.get(eventId)) {
      fetchCommentsThrottled(eventId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmitComment = async (content: string, parentId?: string) => {
    if (!user) {
      showNotification(NOTIFICATION_MESSAGES.LOGIN_TO_COMMENT, "warning");
      return;
    }

    const commentEvent = {
      kind: 1,
      content: content,
      tags: [
        ...extractMentionTags(content),
        ["e", eventId, "", "root"],
        ...(parentId ? [["e", parentId, "", "reply"]] : []),
      ],
      created_at: Math.floor(Date.now() / 1000),
    };

    const signedComment = await signEvent(commentEvent, user.privateKey);
    pool.publish(relays, signedComment!);
    setReplyTo(null);
  };

  const renderComments = (comments: Event[], parentId: string | null) => {
    return comments
      .filter((comment) => {
        const isReplyTo = comment.tags.filter(
          (tag) => tag[3] === "reply"
        )?.[0]?.[1];

        if (parentId === null) {
          return !isReplyTo || replyTo === eventId;
        }

        // If parentId is specified, we want replies to that parentId
        return comment.tags.some(
          (tag) => tag[1] === parentId && tag[3] === "reply"
        );
      })
      .map((comment) => {
        const hasReplies = comments.some((c) =>
          c.tags.some((tag) => tag[3] === "reply" && tag[1] === comment.id)
        );

        return (
          <div key={comment.id} style={{ marginLeft: "8px" }}>
            <CommentCard comment={comment} depth={depth} onReply={setReplyTo}>
              {/* Show/Hide Replies Button */}
              {hasReplies && (
                <Box sx={{ px: 2, pb: 1 }}>
                  <Button
                    onClick={() =>
                      setShowReplies((prev) => {
                        const updated = new Map(prev);
                        updated.set(comment.id, !prev.get(comment.id));
                        return updated;
                      })
                    }
                    size="small"
                    sx={(theme) => ({
                      ...getColorsWithTheme(theme, { color: "#000000" }),
                      p: 0,
                      fontSize: "0.75rem",
                    })}
                  >
                    {showReplies.get(comment.id) ? "Hide Replies" : "Show Replies"}
                  </Button>
                </Box>
              )}
            </CommentCard>

            {/* Reply input when this comment is selected for replying */}
            <Collapse in={replyTo === comment.id} timeout={200} unmountOnExit>
              <Box sx={{ mt: 1, ml: 1 }}>
                <CommentInput
                  onSubmit={(content) => {
                    handleSubmitComment(content, comment.id);
                    setReplyTo(null);
                  }}
                />
              </Box>
            </Collapse>

            {/* Render child comments if visible */}
            <Collapse
              in={!!showReplies.get(comment.id)}
              timeout={200}
              unmountOnExit
            >
              {renderComments(comments, comment.id)}
            </Collapse>
          </div>
        );
      });
  };

  const comments = commentsMap?.get(eventId) || [];
  const localCommentsMap = new Map((comments || []).map((c) => [c.id, c]));

  if (!showComments) {
    return null;
  }

  return (
    <div style={{ width: "100%" }}>
      <CommentInput onSubmit={(content) => handleSubmitComment(content)} />
      <div style={{ marginTop: "16px" }}>
        {comments.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No comments yet
          </Typography>
        ) : (
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Comments
          </Typography>
        )}
        {renderComments(Array.from(localCommentsMap.values()), null)}
      </div>
    </div>
  );
};

export default CommentSection;
