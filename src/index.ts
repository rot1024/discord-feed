import { Hono } from "hono";
import type { Env } from "./types";
import { verifyDiscordRequest } from "./discord/verify";
import { handleInteraction } from "./discord/interactions";
import { FeedStore } from "./kv/store";
import { DiscordAPI } from "./discord/api";
import { FeedFetcher } from "./feed/fetcher";

type Variables = {
  store: FeedStore;
  discord: DiscordAPI;
  fetcher: FeedFetcher;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Initialize services middleware
app.use("*", async (c, next) => {
  const store = new FeedStore(c.env.KV);
  const discord = new DiscordAPI(c.env.DISCORD_BOT_TOKEN);
  const fetcher = new FeedFetcher(store, discord);
  c.set("store", store);
  c.set("discord", discord);
  c.set("fetcher", fetcher);
  await next();
});

// Discord Interactions endpoint
app.post("/interactions", async (c) => {
  const { isValid, body } = await verifyDiscordRequest(
    c.req.raw.clone(),
    c.env.DISCORD_PUBLIC_KEY
  );

  if (!isValid) {
    return c.text("Invalid request signature", 401);
  }

  const interaction = JSON.parse(body);
  return handleInteraction(interaction, c.get("store"), c.get("discord"));
});

// Health check
app.get("/", (c) => {
  return c.json({ status: "ok", name: "discord-feed" });
});

// Verify admin token
function verifyAdminToken(c: { env: Env; req: { header: (name: string) => string | undefined } }): boolean {
  const token = c.env.ADMIN_TOKEN;
  if (!token) return true; // No token set = no auth required
  const authHeader = c.req.header("Authorization");
  return authHeader === `Bearer ${token}`;
}

// Manually trigger feed check
app.post("/trigger", async (c) => {
  if (!verifyAdminToken(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const result = await c.get("fetcher").checkAllFeeds();
  console.log("Feed check triggered via API:", JSON.stringify(result));
  return c.json({ success: true, totalFeeds: result.totalFeeds });
});

// Register slash commands (run once after deploy)
app.post("/register", async (c) => {
  if (!verifyAdminToken(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const commands = [
    {
      name: "feed",
      description: "Manage RSS feeds",
      options: [
        {
          type: 1, // SUB_COMMAND
          name: "add",
          description: "Register a feed",
          options: [
            { type: 3, name: "url", description: "Feed URL", required: true },
          ],
        },
        {
          type: 1, // SUB_COMMAND
          name: "remove",
          description: "Remove a feed",
          options: [
            { type: 3, name: "url", description: "Feed URL", required: true },
          ],
        },
        {
          type: 1, // SUB_COMMAND
          name: "list",
          description: "List registered feeds",
        },
        {
          type: 1, // SUB_COMMAND
          name: "test",
          description: "Test a feed (post 1 item without updating state)",
          options: [
            { type: 3, name: "url", description: "Feed URL or number from list", required: true },
          ],
        },
      ],
    },
  ];

  const response = await fetch(
    `https://discord.com/api/v10/applications/${c.env.DISCORD_APP_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${c.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    return c.json({ error: `Failed to register: ${error}` }, 500);
  }

  const result = await response.json();
  return c.json({ success: true, commands: result });
});

// Worker export
export default {
  fetch: app.fetch,

  // Cron Trigger handler
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const store = new FeedStore(env.KV);
    const discord = new DiscordAPI(env.DISCORD_BOT_TOKEN);
    const fetcher = new FeedFetcher(store, discord);

    const result = await fetcher.checkAllFeeds();
    console.log("Feed check triggered via cron:", JSON.stringify(result));
  },
};
