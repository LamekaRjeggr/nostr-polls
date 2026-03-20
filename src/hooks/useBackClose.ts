import { useEffect } from "react";

/**
 * Close a modal/dialog on the browser back gesture.
 *
 * When `open` becomes true we push a disposable history entry.
 * When the user presses "back" (hardware button, swipe gesture, or browser
 * back), the popstate fires and we call `onClose`.
 * When the modal is closed programmatically (button, overlay click, etc.)
 * we go back to pop the sentinel entry we pushed.
 */
export function useBackClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;

    // Sentinel so we can tell our entry apart from real navigation.
    const sentinel = `modal-${Date.now()}`;
    window.history.pushState({ sentinel }, "");

    const onPopState = (e: PopStateEvent) => {
      // Close only when we LEAVE the sentinel (navigating away from it).
      // If e.state is our sentinel, we arrived back AT it from something pushed on
      // top (e.g. a lightbox), so we must NOT close.
      if (e.state?.sentinel !== sentinel) {
        onClose();
      }
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      // If the modal was closed by something other than back (e.g. a close
      // button), pop the sentinel entry we pushed so it doesn't linger.
      if (window.history.state?.sentinel === sentinel) {
        window.history.back();
      }
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}
