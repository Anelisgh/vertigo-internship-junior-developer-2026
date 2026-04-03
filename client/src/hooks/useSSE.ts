import { useEffect, useRef } from "react";

/**
 * Generic SSE hook.
 *
 * Manages EventSource lifecycle: opens on mount, reconnects on error (2 s
 * back-off), and closes on unmount or when `url` changes.
 *
 * @param url   The SSE endpoint URL. Pass `null` to disable.
 * @param onMessage  Called with the parsed JSON payload for every "message" event.
 */
export function useSSE<T = unknown>(url: string | null, onMessage: (data: T) => void) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage; // always current without re-subscribing

  useEffect(() => {
    if (!url) return;

    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    function connect() {
      es = new EventSource(url as string);

      es.onmessage = (event) => {
        try {
          onMessageRef.current(JSON.parse(event.data) as T);
        } catch {
          /* ignore parse errors */
        }
      };

      es.onerror = () => {
        es?.close();
        if (active) {
          retryTimeout = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      active = false;
      es?.close();
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [url]);
}
