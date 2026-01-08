import { decode } from "html-entities";
import type { DiscordEmbed, FeedItem } from "../types";

const DISCORD_API_BASE = "https://discord.com/api/v10";

export class DiscordAPI {
  constructor(private botToken: string) {}

  // Send message to a channel
  async sendMessage(
    channelId: string,
    content?: string,
    embeds?: DiscordEmbed[]
  ): Promise<void> {
    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${this.botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
          embeds,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${response.status} ${error}`);
    }
  }

  // Send feed item as embed to a channel
  async sendFeedItem(
    channelId: string,
    item: FeedItem,
    feedTitle: string
  ): Promise<void> {
    const embed: DiscordEmbed = {
      title: item.title,
      url: item.link,
      description: item.description
        ? truncate(stripHtml(item.description), 200)
        : undefined,
      color: 0x5865f2, // Discord Blue
      footer: {
        text: feedTitle,
      },
      timestamp: item.pubDate,
      image: item.image ? { url: item.image } : undefined,
    };

    await this.sendMessage(channelId, undefined, [embed]);
  }
}

// Strip HTML tags and decode entities
function stripHtml(html: string): string {
  return decode(html.replace(/<[^>]*>/g, "")).trim();
}

// Truncate string to max length
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + "...";
}
