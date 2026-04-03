/**
 * SSE (Server-Sent Events) broadcast helpers.
 *
 * Two channels:
 *  - "markets"        → dashboard list updates (new bet on any market)
 *  - "market:<id>"    → single-market detail updates
 *
 * Usage:
 *   sseHub.addClient("markets", controller);
 *   sseHub.broadcast("markets", payload);
 *   sseHub.broadcast(`market:${id}`, payload);
 */

type Controller = ReadableStreamDefaultController;

class SseHub {
  private channels = new Map<string, Set<Controller>>();

  addClient(channel: string, controller: Controller) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(controller);
  }

  removeClient(channel: string, controller: Controller) {
    this.channels.get(channel)?.delete(controller);
  }

  broadcast(channel: string, data: unknown) {
    const clients = this.channels.get(channel);
    if (!clients || clients.size === 0) return;

    const payload = `data: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(payload);

    for (const ctrl of clients) {
      try {
        ctrl.enqueue(encoded);
      } catch {
        // Client disconnected – clean up lazily
        clients.delete(ctrl);
      }
    }
  }

  /** Ping all clients on all channels to keep connections alive */
  heartbeat() {
    const ping = new TextEncoder().encode(": ping\n\n");
    for (const clients of this.channels.values()) {
      for (const ctrl of clients) {
        try {
          ctrl.enqueue(ping);
        } catch {
          clients.delete(ctrl);
        }
      }
    }
  }
}

export const sseHub = new SseHub();

// Send a heartbeat every 30 seconds
setInterval(() => sseHub.heartbeat(), 30_000);
