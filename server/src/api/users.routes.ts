import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  handleGetMe,
  handleGetUserBets,
  handleGetLeaderboard,
  handleGenerateApiKey,
  handleRevokeApiKey,
} from "./handlers";

export const userRoutes = new Elysia({ prefix: "/api" })
  .use(authMiddleware)
  // Public
  .get("/leaderboard", handleGetLeaderboard, {
    query: t.Object({ page: t.Optional(t.String()) }),
  })
  // Auth-guarded
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
        .get("/users/me", handleGetMe)
        .get("/users/me/bets", handleGetUserBets, {
          query: t.Object({
            page: t.Optional(t.String()),
            type: t.Optional(t.String()),
          }),
        })
        .post("/users/me/api-keys", handleGenerateApiKey)
        .delete("/users/me/api-keys", handleRevokeApiKey),
  );
