import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import CellTowerIcon from '@mui/icons-material/CellTower';
import { useBackClose } from '../../hooks/useBackClose';

interface RelaySourceModalProps {
  open: boolean;
  onClose: () => void;
  relays: string[];
}

function hostname(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

export const RelaySourceModal: React.FC<RelaySourceModalProps> = ({ open, onClose, relays }) => {
  useBackClose(open, onClose);
  return (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CellTowerIcon fontSize="small" color="action" />
        <Typography variant="h6">
          Found on {relays.length} relay{relays.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
    </DialogTitle>
    <DialogContent sx={{ pt: 0 }}>
      {relays.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No relay info available.
        </Typography>
      ) : (
        <List dense disablePadding>
          {relays.map((relay) => (
            <ListItem key={relay} disablePadding sx={{ py: 0.5 }}>
              <ListItemText
                primary={hostname(relay)}
                secondary={relay}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                secondaryTypographyProps={{
                  variant: 'caption',
                  sx: { fontFamily: 'monospace', fontSize: '0.65rem', wordBreak: 'break-all' },
                }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
  );
};
