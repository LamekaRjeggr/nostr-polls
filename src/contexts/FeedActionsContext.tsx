import React, { createContext, useCallback, useContext, useRef, useState } from "react";

interface FeedActionsCtx {
  isScrolledDown: boolean;
  scrollToTop: () => void;
  /** Called by the active feed to register its scroll state + scroll-to-top function */
  reportScrollState: (isDown: boolean, fn: () => void) => void;
  /** Called by the active feed to register its refresh function */
  registerRefresh: (fn: () => void) => void;
  /** Calls the currently registered refresh function */
  refresh: () => void;
}

const FeedActionsContext = createContext<FeedActionsCtx>({
  isScrolledDown: false,
  scrollToTop: () => {},
  reportScrollState: () => {},
  registerRefresh: () => {},
  refresh: () => {},
});

export const FeedActionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const scrollFnRef = useRef<() => void>(() => {});
  const refreshFnRef = useRef<() => void>(() => {});

  const scrollToTop = useCallback(() => scrollFnRef.current(), []);
  const refresh = useCallback(() => refreshFnRef.current(), []);

  const reportScrollState = useCallback((isDown: boolean, fn: () => void) => {
    scrollFnRef.current = fn;
    setIsScrolledDown((prev) => (prev !== isDown ? isDown : prev));
  }, []);

  const registerRefresh = useCallback((fn: () => void) => {
    refreshFnRef.current = fn;
  }, []);

  return (
    <FeedActionsContext.Provider value={{ isScrolledDown, scrollToTop, reportScrollState, registerRefresh, refresh }}>
      {children}
    </FeedActionsContext.Provider>
  );
};

export const useFeedActions = () => useContext(FeedActionsContext);
