import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  handleCreateMarket,
  handleListMarkets,
  handleGetMarket,
  handlePlaceBet,
  handleResolveMarket,
  handleArchiveMarket,
} from "./handlers";
import { sseHub } from "../lib/sse-hub";

export const marketRoutes = new Elysia({ prefix: "/api/markets" })
  .use(authMiddleware)
  // Public endpoints
  .get("/", handleListMarkets, {
    query: t.Object({
      status: t.Optional(t.String()),
      page: t.Optional(t.String()),
      sort: t.Optional(t.String()),
      order: t.Optional(t.String()),
    }),
  })
  .get("/:id", handleGetMarket, {
    params: t.Object({ id: t.Numeric() }),
  })
  // SSE – market list updates
  .get("/stream", ({ request }) => {
    let controller: ReadableStreamDefaultController | null = null;

    const stream = new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        sseHub.addClient("markets", ctrl);
      },
      cancel() {
        if (controller) sseHub.removeClient("markets", controller);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  })
  // SSE – single market updates
  .get("/:id/stream", ({ params }) => {
    const channel = `market:${params.id}`;
    let controller: ReadableStreamDefaultController | null = null;

    const stream = new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        sseHub.addClient(channel, ctrl);
      },
      cancel() {
        if (controller) sseHub.removeClient(channel, controller!);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  })
  // Auth-guarded endpoints
  .guard(
    {
      beforeHandle({ user, set }) {
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
      },
    },
    (app) =>
      app
        .post("/", handleCreateMarket, {
          body: t.Object({
            title: t.String(),
            description: t.Optional(t.String()),
            outcomes: t.Array(t.String()),
          }),
        })
        .post("/:id/bets", handlePlaceBet, {
          params: t.Object({ id: t.Numeric() }),
          body: t.Object({
            outcomeId: t.Number(),
            amount: t.Number(),
          }),
        })
        .post("/:id/resolve", handleResolveMarket, {
          params: t.Object({ id: t.Numeric() }),
          body: t.Object({ outcomeId: t.Number() }),
        })
        .post("/:id/archive", handleArchiveMarket, {
          params: t.Object({ id: t.Numeric() }),
        }),
  );
