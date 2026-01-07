import { Hono } from "hono";
import type { Env } from "./types";
import { verifyDiscordRequest } from "./discord/verify";
import { handleInteraction } from "./discord/interactions";
import { FeedStore } from "./kv/store";
import { DiscordAPI } from "./discord/api";
import { FeedFetcher } from "./feed/fetcher";

const app = new Hono<{ Bindings: Env }>();

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
  const store = new FeedStore(c.env.KV);

  return handleInteraction(interaction, store);
});

// Health check
app.get("/", (c) => {
  return c.json({ status: "ok", name: "discord-feed" });
});

// Register slash commands (run once after deploy)
app.post("/register", async (c) => {
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

    await fetcher.checkAllFeeds();
  },
};
