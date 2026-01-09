import { decode } from "html-entities";
import type { FeedItem } from "../types";

const DISCORD_API_BASE = "https://discord.com/api/v10";

export class DiscordAPI {
  constructor(private botToken: string) {}

  // Send message to a channel
  async sendMessage(channelId: string, content: string): Promise<void> {
    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${this.botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${response.status} ${error}`);
    }
  }

  // Send feed item to a channel (URL triggers OG preview)
  async sendFeedItem(
    channelId: string,
    item: FeedItem,
    feedTitle: string
  ): Promise<void> {
    const title = decode(item.title);
    const content = `**${title}**\n${feedTitle}\n${item.link}`;
    await this.sendMessage(channelId, content);
  }
}
