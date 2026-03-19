import {
  Avatar,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  Menu,
  Snackbar,
  MenuItem,
  IconButton,
  DialogTitle,
  Dialog,
  DialogContent,
  DialogActions,
  Collapse,
  Box,
  CircularProgress,
} from "@mui/material";
import { Event, EventTemplate, nip19 } from "nostr-tools";
import { TextWithImages } from "../Common/Parsers/TextWithImages";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../hooks/useAppContext";
import { DEFAULT_IMAGE_URL } from "../../utils/constants";
import { openProfileTab, signEvent } from "../../nostr";
import { calculateTimeAgo } from "../../utils/common";
import { getAppBaseUrl } from "../../utils/platform";
import { PrepareNote } from "./PrepareNote";
import { FeedbackMenu } from "../FeedbackMenu";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useResizeObserver } from "../../hooks/useResizeObserver";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SummarizeIcon from "@mui/icons-material/Summarize";
import CellTowerIcon from "@mui/icons-material/CellTower";
import { waitForPublish } from "../../utils/publish";
import { usePublishDiagnostic } from "../../hooks/usePublishDiagnostic";
import RateEventModal from "../../components/Ratings/RateEventModal";
import { useUserContext } from "../../hooks/useUserContext";
import { useListContext } from "../../hooks/useListContext";
import { pool } from "../../singletons";
import { useRelays } from "../../hooks/useRelays";
import { useNotification } from "../../contexts/notification-context";
import { NOTIFICATION_MESSAGES } from "../../constants/notifications";
import { aiService } from "../../services/ai-service";
import { useReports } from "../../hooks/useReports";
import { ReportDialog } from "../Report/ReportDialog";
import { ReportReason } from "../../contexts/reports-context";
import FlagIcon from "@mui/icons-material/Flag";
import OverlappingAvatars from "../Common/OverlappingAvatars";
import { Nip05Badge } from "../Common/Nip05Badge";
import { RelaySourceModal } from "../Common/RelaySourceModal";
import { PublishDiagnosticModal } from "../Common/PublishDiagnosticModal";
import { useEventRelays } from "../../hooks/useEventRelays";

interface NotesProps {
  event: Event;
  extras?: React.ReactNode;
  hidden?: boolean;
  showReason?: React.ReactNode;
}

export const Notes: React.FC<NotesProps> = ({
  event,
  extras,
  hidden = false,
  showReason,
}) => {
  const navigate = useNavigate();
  const { profiles, fetchUserProfileThrottled, aiSettings } = useAppContext();
  let { user, requestLogin, setUser } = useUserContext();
  let { relays, writeRelays } = useRelays();
  let { fetchLatestContactList } = useListContext();
  const replyingTo = event.tags.findLast((t) => t[0] === "e")?.[1] || null;
  const isValidHex = (s: string | null) => s && s.length === 64 && /^[0-9a-f]+$/i.test(s);
  const replyingToNevent = replyingTo && isValidHex(replyingTo)
    ? nip19.neventEncode({ id: replyingTo })
    : null;
  const referencedEventId = event.tags.find((t) => t[0] === "e")?.[1] || null;
  const referencedEventNevent = referencedEventId && isValidHex(referencedEventId)
    ? nip19.neventEncode({ id: referencedEventId })
    : null;

  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const [parentModalOpen, setParentModalOpen] = useState(false);
  const [parentEventId, setParentEventId] = useState<string | null>(null);
  const [showContactListWarning, setShowContactListWarning] = useState(false);
  const [pendingFollowKey, setPendingFollowKey] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const { reportEvent, reportUser, isReportedByMe, getWoTReporters, wotReportThreshold, requestUserReportCheck } = useReports();
  const [reportPostDialogOpen, setReportPostDialogOpen] = useState(false);
  const [reportUserDialogOpen, setReportUserDialogOpen] = useState(false);
  const [showReportedAnyway, setShowReportedAnyway] = useState(false);

  // Relay source
  const eventRelays = useEventRelays(event.id);
  const [relayModalOpen, setRelayModalOpen] = useState(false);

  // Broadcast state
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const { result: broadcastResult, open: diagnosticOpen, setOpen: setDiagnosticOpen, title: diagnosticTitle, openModal: openDiagnostic, retry } = usePublishDiagnostic();

  const handleBroadcast = async () => {
    if (isBroadcasting) return;
    setIsBroadcasting(true);
    try {
      const res = await waitForPublish(writeRelays, event);
      openDiagnostic(event, res, "Broadcast relay results");
    } catch {
      openDiagnostic(event, { ok: false, accepted: 0, total: relays.length, relayResults: [] }, "Broadcast relay results");
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Summarization state
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Check if post is long enough to warrant summarization (500+ chars)
  const isLongPost = event.content.length > 500;

  const addToContacts = async () => {
    if (!user) {
      requestLogin();
      return;
    }

    const pubkeyToAdd = event.pubkey;
    const contactEvent = await fetchLatestContactList();

    // New safeguard
    if (!contactEvent) {
      setPendingFollowKey(pubkeyToAdd);
      setShowContactListWarning(true);
      return;
    }

    await updateContactList(contactEvent, pubkeyToAdd);
  };

  const copyNoteUrl = async () => {
    const nevent = nip19.neventEncode({
      id: event.id,
      relays,
      kind: event.kind,
    });
    try {
      await navigator.clipboard.writeText(
        `${getAppBaseUrl()}/note/${nevent}`
      );
      showNotification(NOTIFICATION_MESSAGES.EVENT_COPIED, "success");
    } catch (error) {
      console.error("Failed to copy event:", error);
      showNotification(NOTIFICATION_MESSAGES.EVENT_COPY_FAILED, "error");
    }
  };

  const updateContactList = async (
    contactEvent: Event | null,
    pubkeyToAdd: string
  ) => {
    const existingTags = contactEvent?.tags || [];
    const pTags = existingTags.filter(([t]) => t === "p").map(([, pk]) => pk);

    if (pTags.includes(pubkeyToAdd)) return;

    const updatedTags = [...existingTags, ["p", pubkeyToAdd]];

    const newEvent: EventTemplate = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags: updatedTags,
      content: contactEvent?.content || "",
    };

    const signed = await signEvent(newEvent);
    pool.publish(relays, signed);
    setUser({
      pubkey: signed.pubkey,
      ...user,
      follows: [...pTags, pubkeyToAdd],
    });
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    // Don't intercept context menu inside inputs/textareas/links — user needs
    // native browser menu for paste, spell-check, open-in-new-tab, etc.
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      target.closest("a")
    ) {
      return;
    }
    // On touch devices, don't intercept — the long-press context menu is how
    // users start text selection. The ⋮ button provides the same actions.
    if (navigator.maxTouchPoints > 0) {
      return;
    }
    event.preventDefault();
    setMenuAnchor(event.currentTarget as HTMLElement);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
  };

  const handleCopyNevent = () => {
    const nevent = nip19.neventEncode({ id: event.id });
    navigator.clipboard.writeText(nevent).then(() => {
      setSnackbarOpen(true);
    });
    handleCloseMenu();
  };

  const handleCopyNpub = async () => {
    const npub = nip19.npubEncode(event.pubkey);
    try {
      await navigator.clipboard.writeText(npub);
      showNotification(NOTIFICATION_MESSAGES.NPUB_COPIED, "success");
    } catch (error) {
      console.error("Failed to copy npub:", error);
      showNotification(NOTIFICATION_MESSAGES.COPY_FAILED, "error");
    }
    handleCloseMenu();
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  const handleSummarize = async () => {
    if (!aiSettings.model) {
      showNotification("Please configure AI settings first", "warning");
      return;
    }

    // If already have summary, just toggle display
    if (summary) {
      setShowSummary(!showSummary);
      handleCloseMenu();
      return;
    }

    setIsSummarizing(true);
    handleCloseMenu();

    try {
      const result = await aiService.summarizePost({
        model: aiSettings.model,
        text: event.content,
      });

      if (result.success && result.data) {
        setSummary(result.data.summary);
        setShowSummary(true);
      } else {
        showNotification(result.error || "Failed to summarize", "error");
      }
    } catch (error) {
      console.error("Summarization error:", error);
      showNotification("Failed to summarize post", "error");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleReportPost = async (reason: ReportReason, content: string) => {
    await reportEvent(event.id, event.pubkey, reason, content);
    showNotification("Post reported", "success");
  };

  const handleReportUser = async (reason: ReportReason, content: string) => {
    await reportUser(event.pubkey, reason, content);
    showNotification("User reported", "success");
  };

  // Ensure WoT user-level reports are fetched for this author
  useEffect(() => {
    requestUserReportCheck([event.pubkey]);
  }, [event.pubkey]); // eslint-disable-line react-hooks/exhaustive-deps

  const wotEventReporters = getWoTReporters(event.id);
  const wotAuthorReporters = getWoTReporters(event.pubkey);
  // Merge: someone who reported the author is effectively reporting all their posts
  const wotReporters = new Set([
    ...Array.from(wotEventReporters),
    ...Array.from(wotAuthorReporters),
  ]);
  const hiddenByReport =
    !showReportedAnyway &&
    (isReportedByMe(event.id) ||
      isReportedByMe(event.pubkey) ||
      (wotReportThreshold > 0 && wotReporters.size >= wotReportThreshold));

  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const isMedium = useMediaQuery(theme.breakpoints.between("sm", "md"));
  const maxContentHeight = isSmall ? 400 : isMedium ? 500 : 600;
  const primaryColor = theme.palette.primary.main;
  const subtleGradient = `linear-gradient(
    to bottom,
    rgba(255,255,255,0),
    ${alpha(primaryColor, 0.6)} 100%
  )`;

  const checkOverflow = () => {
    const el = contentRef.current;
    if (el) {
      setIsOverflowing(el.scrollHeight > el.clientHeight);
    }
  };

  useEffect(() => {
    if (!profiles?.has(event.pubkey)) {
      fetchUserProfileThrottled(event.pubkey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.pubkey]);

  useResizeObserver(contentRef, checkOverflow);

  const timeAgo = calculateTimeAgo(event.created_at);
  return (
    <>
      {hiddenByReport ? (
        <Card
          variant="outlined"
          sx={{ m: 1, p: 1.5, border: "1px dashed #e57373" }}
        >
          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">
              Content hidden — reported by
            </Typography>
            <OverlappingAvatars
              ids={
                isReportedByMe(event.id) && wotReporters.size === 0
                  ? [user!.pubkey]
                  : isReportedByMe(event.id)
                  ? [user!.pubkey, ...Array.from(wotReporters)]
                  : Array.from(wotReporters)
              }
              maxAvatars={5}
            />
            <Button
              size="small"
              sx={{ ml: "auto" }}
              onClick={() => setShowReportedAnyway(true)}
            >
              Show anyway
            </Button>
          </Box>
        </Card>
      ) : hidden ? (
        <Card
          variant="outlined"
          sx={{
            m: 1,
            p: 2,
            border: "1px dashed #aaa",
          }}
        >
          {showReason || (
            <Typography variant="body2">
              This note has been marked as off-topic or muted.
            </Typography>
          )}
        </Card>
      ) : (
        <Card
          variant="outlined"
          className="poll-response-form"
          sx={{
            m: 1,
            opacity: hidden ? 0.5 : 1,
            pointerEvents: hidden ? "auto" : "auto",
          }}
          onContextMenu={handleContextMenu}
        >
          {referencedEventId && (
            <Button
              variant="text"
              size="small"
              sx={{ ml: 2, mt: 1 }}
              onClick={() => {
                setParentEventId(referencedEventNevent);
                setParentModalOpen(true);
              }}
            >
              View Parent
            </Button>
          )}

          <CardHeader
            avatar={
              <Avatar
                src={profiles?.get(event.pubkey)?.picture || DEFAULT_IMAGE_URL}
                onClick={() => openProfileTab(nip19.npubEncode(event.pubkey), navigate)}
                sx={{ cursor: "pointer" }}
              />
            }
            title={
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Box>
                  <Typography>
                    {profiles?.get(event.pubkey)?.name ||
                      profiles?.get(event.pubkey)?.username ||
                      profiles?.get(event.pubkey)?.nip05 ||
                      (() => {
                        const npub = nip19.npubEncode(event.pubkey);
                        return npub.slice(0, 6) + "…" + npub.slice(-4);
                      })()}
                  </Typography>
                  <Nip05Badge
                    nip05={profiles?.get(event.pubkey)?.nip05}
                    pubkey={event.pubkey}
                  />
                </Box>
                {user && !user.follows?.includes(event.pubkey) ? (
                  <Button onClick={addToContacts}>Follow</Button>
                ) : null}
              </div>
            }
            action={
              <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)}>
                <MoreVertIcon />
              </IconButton>
            }
            subheader={timeAgo}
            sx={{ m: 0, pl: 2, pt: 1 }}
          />

          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={handleCloseMenu}
          >
            {isLongPost && aiSettings.model && (
              <MenuItem onClick={handleSummarize} disabled={isSummarizing}>
                <SummarizeIcon fontSize="small" sx={{ mr: 1 }} />
                {isSummarizing
                  ? "Summarizing..."
                  : summary
                  ? (showSummary ? "Hide Summary" : "Show Summary")
                  : "Summarize"}
              </MenuItem>
            )}
            <MenuItem
              onClick={handleBroadcast}
              disabled={isBroadcasting}
              sx={{ gap: 1 }}
            >
              {isBroadcasting ? (
                <CircularProgress size={16} />
              ) : (
                <CellTowerIcon fontSize="small" sx={broadcastResult ? { color: broadcastResult.accepted > 0 ? "success.main" : "error.main" } : {}} />
              )}
              {isBroadcasting
                ? "Broadcasting…"
                : broadcastResult
                ? `Broadcasted: ${broadcastResult.accepted} / ${broadcastResult.total} relays`
                : "Broadcast"}
            </MenuItem>
            {broadcastResult && (
              <MenuItem onClick={() => setDiagnosticOpen(true)} sx={{ gap: 1, fontSize: "0.8rem", color: "text.secondary" }}>
                View relay details
              </MenuItem>
            )}
            {eventRelays.length > 0 && (
              <MenuItem onClick={() => { setRelayModalOpen(true); handleCloseMenu(); }} sx={{ gap: 1 }}>
                <CellTowerIcon fontSize="small" />
                Found on {eventRelays.length} relay{eventRelays.length !== 1 ? 's' : ''}
              </MenuItem>
            )}
            <MenuItem onClick={handleCopyNevent}>Copy Event Id</MenuItem>
            <MenuItem onClick={copyNoteUrl}>Copy Link</MenuItem>
            <MenuItem onClick={handleCopyNpub}>Copy Author npub</MenuItem>
            {user && (
              <MenuItem
                onClick={() => {
                  handleCloseMenu();
                  setReportPostDialogOpen(true);
                }}
                sx={{ color: "error.main" }}
              >
                <FlagIcon fontSize="small" sx={{ mr: 1 }} />
                Report post
              </MenuItem>
            )}
            {user && (
              <MenuItem
                onClick={() => {
                  handleCloseMenu();
                  setReportUserDialogOpen(true);
                }}
                sx={{ color: "error.main" }}
              >
                <FlagIcon fontSize="small" sx={{ mr: 1 }} />
                Report user
              </MenuItem>
            )}
            {extras}
          </Menu>

          <Snackbar
            open={snackbarOpen}
            autoHideDuration={2000}
            onClose={handleCloseSnackbar}
            message="Copied nevent to clipboard"
          />

          {/* AI Summary */}
          {isSummarizing && (
            <Box display="flex" alignItems="center" gap={1} sx={{ ml: 2, mt: 1, mb: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Generating summary...
              </Typography>
            </Box>
          )}

          <Collapse in={showSummary && !isSummarizing}>
            <Box
              sx={{
                ml: 2,
                mr: 2,
                mt: 1,
                mb: 1,
                p: 2,
                bgcolor: "action.hover",
                borderRadius: 1,
                borderLeft: 3,
                borderColor: "primary.main",
              }}
            >
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <SummarizeIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" fontWeight="bold">
                  AI Summary
                </Typography>
              </Box>
              <Typography variant="body2">{summary}</Typography>
            </Box>
          </Collapse>

          <Card variant="outlined" sx={{ position: "relative", overflow: "hidden" }}>
            <CardContent
              ref={contentRef}
              sx={{
                position: "relative",
                overflow: isExpanded ? "visible" : "hidden",
                maxHeight: isExpanded ? "none" : maxContentHeight,
                transition: "max-height 0.3s ease",
                p: 2,
              }}
            >
              <TextWithImages content={event.content} tags={event.tags} />

              {replyingToNevent ? (
                <div style={{ borderRadius: "2px", borderColor: "grey" }}>
                  <PrepareNote neventId={replyingToNevent} />
                </div>
              ) : null}

              {!isExpanded && isOverflowing && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    width: "100%",
                    height: "60px",
                    background: subtleGradient,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "flex-end",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      backdropFilter: "blur(6px)",
                      paddingBottom: 8,
                      pointerEvents: "auto",
                    }}
                  >
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => setIsExpanded(true)}
                    >
                      See more
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <FeedbackMenu event={event} />
        </Card>
      )}

      <RateEventModal
        open={parentModalOpen}
        onClose={() => {
          setParentModalOpen(false);
          setParentEventId(null);
        }}
        initialEventId={parentEventId}
      />
      <Dialog
        open={showContactListWarning}
        onClose={() => setShowContactListWarning(false)}
      >
        <DialogTitle>Warning</DialogTitle>
        <DialogContent>
          <Typography>
            We couldn’t find your existing contact list. If you continue, your
            follow list will only contain this person.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowContactListWarning(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (pendingFollowKey) {
                updateContactList(null, pendingFollowKey);
              }
              setShowContactListWarning(false);
              setPendingFollowKey(null);
            }}
            color="primary"
            variant="contained"
          >
            Continue Anyway
          </Button>
        </DialogActions>
      </Dialog>

      <ReportDialog
        open={reportPostDialogOpen}
        onClose={() => setReportPostDialogOpen(false)}
        onSubmit={handleReportPost}
        title="Report post"
      />
      <ReportDialog
        open={reportUserDialogOpen}
        onClose={() => setReportUserDialogOpen(false)}
        onSubmit={handleReportUser}
        title="Report user"
      />
      {broadcastResult && (
        <PublishDiagnosticModal
          open={diagnosticOpen}
          onClose={() => setDiagnosticOpen(false)}
          title={diagnosticTitle}
          entries={broadcastResult.relayResults}
          onRetry={retry}
        />
      )}
      <RelaySourceModal
        open={relayModalOpen}
        onClose={() => setRelayModalOpen(false)}
        relays={eventRelays}
      />
    </>
  );
};
