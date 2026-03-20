import React, { useState } from "react";
import { SpeedDial, SpeedDialAction, SpeedDialIcon } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useNavigate, useLocation } from "react-router-dom";
import { useFeedActions } from "../../contexts/FeedActionsContext";

const CreateFAB: React.FC = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isScrolledDown, scrollToTop, refresh } = useFeedActions();

  const handleCreate = () => {
    setOpen(false);
    if (location.pathname.startsWith("/feeds/polls")) {
      navigate("/create?type=poll");
    } else {
      const match = location.pathname.match(/\/feeds\/topics\/(.+)/);
      if (match) {
        navigate(`/create?hashtag=${encodeURIComponent(match[1])}`);
      } else {
        navigate("/create");
      }
    }
  };

  const handleScrollToTop = () => {
    setOpen(false);
    scrollToTop();
  };

  const handleRefresh = () => {
    setOpen(false);
    refresh();
  };


  return (
    <SpeedDial
      ariaLabel="Feed actions"
      sx={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000 }}
      icon={<SpeedDialIcon icon={<AddIcon />} />}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    >
      {isScrolledDown && (
        <SpeedDialAction
          icon={<KeyboardArrowUpIcon />}
          tooltipTitle="Back to top"
          onClick={handleScrollToTop}
        />
      )}
      <SpeedDialAction
        icon={<RefreshIcon />}
        tooltipTitle="Refresh"
        onClick={handleRefresh}
      />
      <SpeedDialAction
        icon={<AddIcon />}
        tooltipTitle="Create"
        onClick={handleCreate}
      />
    </SpeedDial>
  );
};

export default CreateFAB;
