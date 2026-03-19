import React, { useEffect } from "react";
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { nip19 } from "nostr-tools";
import { useAppContext } from "../../hooks/useAppContext";
import { useUserContext } from "../../hooks/useUserContext";
import { DEFAULT_IMAGE_URL } from "../../utils/constants";
import { Nip05Badge } from "../Common/Nip05Badge";
import { openProfileTab } from "../../nostr";
import { useNavigate } from "react-router-dom";
import { useBackClose } from "../../hooks/useBackClose";

interface FollowPackMembersDialogProps {
  open: boolean;
  onClose: () => void;
  memberPubkeys: string[];
  packTitle: string;
}

export const FollowPackMembersDialog: React.FC<FollowPackMembersDialogProps> = ({
  open,
  onClose,
  memberPubkeys,
  packTitle,
}) => {
  const { profiles, fetchUserProfileThrottled } = useAppContext();
  const { user } = useUserContext();
  const navigate = useNavigate();
  useBackClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    memberPubkeys.forEach((pk) => {
      if (!profiles?.get(pk)) fetchUserProfileThrottled(pk);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberPubkeys.length]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Box>
          <Typography variant="h6" component="span">{packTitle}</Typography>
          <Typography variant="body2" color="text.secondary">
            {memberPubkeys.length} member{memberPubkeys.length !== 1 ? "s" : ""}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <List dense disablePadding>
          {memberPubkeys.map((pk) => {
            const profile = profiles?.get(pk);
            const npub = nip19.npubEncode(pk);
            const name =
              profile?.display_name ||
              profile?.name ||
              npub.slice(0, 8) + "…";

            return (
              <ListItem
                key={pk}
                sx={{
                  px: 2,
                  py: 0.75,
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
                onClick={() => {
                  onClose();
                  openProfileTab(npub, navigate);
                }}
                secondaryAction={
                  user && user.pubkey !== pk && !user.follows?.includes(pk) ? (
                    <Button size="small" variant="outlined" sx={{ minWidth: 70 }}>
                      Follow
                    </Button>
                  ) : undefined
                }
              >
                <ListItemAvatar sx={{ minWidth: 44 }}>
                  <Avatar
                    src={profile?.picture || DEFAULT_IMAGE_URL}
                    sx={{ width: 36, height: 36 }}
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {name}
                    </Typography>
                  }
                  secondary={
                    profile?.nip05 ? (
                      <Nip05Badge nip05={profile.nip05} pubkey={pk} />
                    ) : (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {npub.slice(0, 16)}…
                      </Typography>
                    )
                  }
                />
              </ListItem>
            );
          })}
        </List>
      </DialogContent>
    </Dialog>
  );
};
