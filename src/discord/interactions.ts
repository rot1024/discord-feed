import type { FeedStore } from "../kv/store";

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
  store: FeedStore
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
        const url = subcommand.options?.find((o) => o.name === "url")?.value;
        if (!url) {
          return messageResponse("Error: Please specify a URL", true);
        }

        // Validate URL format
        try {
          new URL(url);
        } catch {
          return messageResponse("Error: Invalid URL", true);
        }

        await store.addFeed(guild_id, channel_id, url, userId);
        return messageResponse(`Feed registered: ${url}`);
      }

      case "remove": {
        const url = subcommand.options?.find((o) => o.name === "url")?.value;
        if (!url) {
          return messageResponse("Error: Please specify a URL", true);
        }

        const removed = await store.removeFeed(guild_id, channel_id, url);
        if (removed) {
          return messageResponse(`Feed removed: ${url}`);
        } else {
          return messageResponse("Error: Feed not found", true);
        }
      }

      case "list": {
        const index = await store.getFeedIndex(guild_id, channel_id);
        if (index.urls.length === 0) {
          return messageResponse("No feeds registered", true);
        }

        const list = index.urls.map((url, i) => `${i + 1}. ${url}`).join("\n");
        return messageResponse(`**Registered Feeds:**\n${list}`, true);
      }

      default:
        return messageResponse("Error: Unknown subcommand", true);
    }
  }

  return messageResponse("Error: Unknown interaction type", true);
}
