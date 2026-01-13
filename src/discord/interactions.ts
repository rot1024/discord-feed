import type { FeedStore } from "../kv/store";
import type { DiscordAPI } from "./api";
import { parseFeed } from "../feed/parser";

// Discord Interaction types (self-defined to avoid Node.js dependencies)
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const;

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
} as const;

// Discord Interaction payload
interface Interaction {
  type: number;
  data?: {
    name: string;
    options?: Array<{
      name: string;
      value: string;
      options?: Array<{
        name: string;
        value: string;
      }>;
    }>;
  };
  guild_id?: string;
  channel_id?: string;
  member?: {
    user: {
      id: string;
    };
  };
}

// Format ISO date as relative time (e.g., "3h ago", "2d ago")
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return "just now";
}

// Create JSON response
function jsonResponse(data: object): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

// Create message response
function messageResponse(content: string, ephemeral = false): Response {
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: ephemeral ? 64 : 0, // 64 = EPHEMERAL
    },
  });
}

export async function handleInteraction(
  interaction: Interaction,
  store: FeedStore,
  discord: DiscordAPI
): Promise<Response> {
  // Respond to PING (for bot verification)
  if (interaction.type === InteractionType.PING) {
    return jsonResponse({ type: InteractionResponseType.PONG });
  }

  // Handle Slash Commands
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const { data, guild_id, channel_id, member } = interaction;

    if (!data || !guild_id || !channel_id || !member) {
      return messageResponse("Error: Invalid request", true);
    }

    const commandName = data.name;
    const subcommand = data.options?.[0];

    if (commandName !== "feed" || !subcommand) {
      return messageResponse("Error: Unknown command", true);
    }

    const userId = member.user.id;

    switch (subcommand.name) {
      case "add": {
        const input = subcommand.options?.find((o) => o.name === "url")?.value;
        if (!input) {
          return messageResponse("Error: Please specify a URL", true);
        }

        // Support multiple URLs separated by whitespace
        const urls = input.trim().split(/\s+/);
        const added: string[] = [];
        const invalid: string[] = [];

        for (const url of urls) {
          // Validate URL format
          try {
            new URL(url);
            await store.addFeed(guild_id, channel_id, url, userId);
            added.push(url);
          } catch {
            invalid.push(url);
          }
        }

        if (added.length === 0) {
          return messageResponse("Error: Invalid URL", true);
        }

        let message = `Feed registered: ${added.join(", ")}`;
        if (invalid.length > 0) {
          message += `\nInvalid URL: ${invalid.join(", ")}`;
        }
        return messageResponse(message);
      }

      case "remove": {
        const input = subcommand.options?.find((o) => o.name === "url")?.value;
        if (!input) {
          return messageResponse("Error: Please specify a URL or number", true);
        }

        // Support multiple inputs separated by whitespace
        const inputs = input.trim().split(/\s+/);
        const index = await store.getFeedIndex(guild_id, channel_id);
        const removed: string[] = [];
        const notFound: string[] = [];

        for (const item of inputs) {
          // Check if input is a number
          const num = parseInt(item, 10);
          let url: string;
          if (!isNaN(num) && num >= 1 && num <= index.urls.length) {
            url = index.urls[num - 1];
          } else {
            url = item;
          }

          const success = await store.removeFeed(guild_id, channel_id, url);
          if (success) {
            removed.push(url);
            // Update index for subsequent number lookups
            const idx = index.urls.indexOf(url);
            if (idx !== -1) {
              index.urls.splice(idx, 1);
            }
          } else {
            notFound.push(item);
          }
        }

        if (removed.length === 0) {
          return messageResponse("Error: Feed not found", true);
        }

        let message = `Feed removed: ${removed.join(", ")}`;
        if (notFound.length > 0) {
          message += `\nNot found: ${notFound.join(", ")}`;
        }
        return messageResponse(message);
      }

      case "list": {
        const index = await store.getFeedIndex(guild_id, channel_id);
        if (index.urls.length === 0) {
          return messageResponse("No feeds registered", true);
        }

        const lines: string[] = [];
        for (let i = 0; i < index.urls.length; i++) {
          const url = index.urls[i];
          const state = await store.getFeedState(url);
          let line = `${i + 1}. `;
          if (state?.title) {
            line += `**${state.title}** ${url}`;
          } else {
            line += url;
          }
          if (state?.error) {
            line += ` ⚠️ \`${state.error}\``;
          }
          // Show last checked and last item dates
          if (state?.lastCheckedAt || state?.lastItemPubDate) {
            const details: string[] = [];
            if (state.lastCheckedAt) {
              details.push(`checked: ${formatRelativeTime(state.lastCheckedAt)}`);
            }
            if (state.lastItemPubDate) {
              details.push(`latest: ${formatRelativeTime(state.lastItemPubDate)}`);
            }
            line += `\n   └ ${details.join(" | ")}`;
          }
          lines.push(line);
        }
        return messageResponse(`**Registered Feeds:**\n${lines.join("\n")}`, true);
      }

      case "test": {
        const input = subcommand.options?.find((o) => o.name === "url")?.value;
        if (!input) {
          return messageResponse("Error: Please specify a URL or number", true);
        }

        // Resolve URL from number if needed
        let url = input.trim();
        const num = parseInt(url, 10);
        if (!isNaN(num) && num >= 1) {
          const index = await store.getFeedIndex(guild_id, channel_id);
          if (num > index.urls.length) {
            return messageResponse(`Error: Number ${num} is out of range`, true);
          }
          url = index.urls[num - 1];
        }

        // Validate URL format
        try {
          new URL(url);
        } catch {
          return messageResponse("Error: Invalid URL", true);
        }

        // Fetch and parse feed
        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent": "Discord-Feed-Bot/1.0",
              Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
            },
          });

          if (!response.ok) {
            return messageResponse(`Error: HTTP ${response.status}`, true);
          }

          const xml = await response.text();
          const feed = parseFeed(xml);

          if (feed.items.length === 0) {
            return messageResponse("Error: No items in feed", true);
          }

          // Send the first item (don't update KV state)
          await discord.sendFeedItem(channel_id, feed.items[0], feed.title);
          return messageResponse(`Test post sent: ${feed.items[0].title}`, true);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return messageResponse(`Error: ${message}`, true);
        }
      }

      default:
        return messageResponse("Error: Unknown subcommand", true);
    }
  }

  return messageResponse("Error: Unknown interaction type", true);
}
