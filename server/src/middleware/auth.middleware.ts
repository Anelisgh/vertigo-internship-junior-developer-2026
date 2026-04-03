import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { getUserById } from "../lib/auth";
import db from "../db";
import { usersTable } from "../db/schema";

/**
 * Auth middleware: resolves the current user from either:
 *  1. Authorization: Bearer <jwt>   (primary – frontend)
 *  2. X-API-Key: pm_<key>           (bonus – bot access)
 *
 * Attaches `user` to the Elysia context (null if unauthenticated).
 */
export const authMiddleware = new Elysia({ name: "auth-middleware" })
  .derive(async ({ headers, jwt }) => {
    // 1. JWT Bearer token
    const authHeader = headers["authorization"];
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = await jwt.verify(token);
      if (payload) {
        const user = await getUserById(payload.userId);
        return { user };
      }
    }

    // 2. API Key header
    const apiKey = headers["x-api-key"];
    if (apiKey) {
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.apiKey, apiKey),
      });
      if (user) return { user };
    }

    return { user: null };
  })
  .as("plugin");
