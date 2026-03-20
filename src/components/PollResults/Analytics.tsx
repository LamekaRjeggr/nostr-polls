import {
  Box,
  LinearProgress,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
} from "@mui/material";
import { Event } from "nostr-tools/lib/types/core";
import { useEffect } from "react";
import { useAppContext } from "../../hooks/useAppContext";
import OverlappingAvatars from "../Common/OverlappingAvatars";
import { TextWithImages } from "../Common/Parsers/TextWithImages";

interface AnalyticsProps {
  pollEvent: Event;
  responses: Event[];
  /** True while waiting for EOSE — shows skeleton bars instead of 0% */
  loading?: boolean;
}

export const Analytics: React.FC<AnalyticsProps> = ({
  pollEvent,
  responses,
  loading,
}) => {
  const label =
    pollEvent.tags.find((t) => t[0] === "label")?.[1] || pollEvent.content;
  const options = pollEvent.tags.filter((t) => t[0] === "option");

  const { profiles, fetchUserProfileThrottled } = useAppContext();

  useEffect(() => {
    responses.forEach((event) => {
      const responderId = event.pubkey;
      if (!profiles?.get(responderId)) {
        fetchUserProfileThrottled(responderId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses]);

  const calculateResults = () => {
    const results: { count: number; responders: Set<string> }[] = options.map(
      () => ({ count: 0, responders: new Set<string>() })
    );
    responses.forEach((event) => {
      const responderId = event.pubkey;
      event.tags.forEach((tag: string[]) => {
        if (tag[0] === "response") {
          const optionId = tag[1];
          const responseIndex = options.findIndex(
            (optionTag) => optionTag[1] === optionId
          );
          if (responseIndex !== -1) {
            if (!results[responseIndex].responders.has(responderId)) {
              results[responseIndex].count++;
              results[responseIndex].responders.add(responderId);
            }
          }
        }
      });
    });
    return results;
  };

  const results = calculateResults();
  const total = results.reduce((acc, r) => acc + r.count, 0);

  const getPercentage = (count: number): number => {
    if (total === 0) return 0;
    return (count / total) * 100;
  };

  return (
    <TableContainer component={Paper}>
      <Table aria-label={`Results for "${label}"`}>
        <TableBody>
          {options.map((option, index) => {
            const responders = Array.from(results[index].responders);
            const pct = getPercentage(results[index].count);
            const isLoading = loading && results[index].count === 0;

            return (
              <TableRow key={index}>
                <TableCell sx={{ width: "40%" }}>
                  <TextWithImages content={option[2]} tags={pollEvent.tags} />
                </TableCell>
                <TableCell sx={{ width: "45%" }}>
                  {isLoading ? (
                    // Animated skeleton bar while waiting for data
                    <Box>
                      <Skeleton
                        variant="rectangular"
                        height={8}
                        sx={{ borderRadius: 1, mb: 0.5 }}
                        animation="wave"
                      />
                      <Skeleton variant="text" width="30%" sx={{ fontSize: "0.75rem" }} animation="wave" />
                    </Box>
                  ) : (
                    <Box>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{ height: 8, borderRadius: 1, mb: 0.5 }}
                      />
                      <Box component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                        {pct.toFixed(1)}%
                      </Box>
                    </Box>
                  )}
                </TableCell>
                <TableCell sx={{ width: "15%" }}>
                  {isLoading ? (
                    <Skeleton variant="circular" width={24} height={24} animation="wave" />
                  ) : (
                    <OverlappingAvatars ids={responders} maxAvatars={2} />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
