import type { FeedStore } from "../kv/store";
import type { DiscordAPI } from "../discord/api";
import type { FeedItem } from "../types";
import { parseFeed } from "./parser";

export class FeedFetcher {
  constructor(
    private store: FeedStore,
    private discord: DiscordAPI
  ) {}

  // Check all feeds and notify new items
  async checkAllFeeds(): Promise<void> {
    const indexes = await this.store.getAllFeedIndexes();

    for (const { channelId, urls } of indexes) {
      for (const url of urls) {
        try {
          await this.checkFeed(url, channelId);
        } catch (error) {
          console.error(`Failed to check feed ${url}:`, error);
        }
      }
    }
  }

  // Check a single feed
  private async checkFeed(url: string, channelId: string): Promise<void> {
    // Fetch feed
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Discord-Feed-Bot/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.status}`);
    }

    const xml = await response.text();
    const feed = parseFeed(xml);

    if (feed.items.length === 0) {
      return;
    }

    // Get previous state
    const state = await this.store.getFeedState(url);
    const lastItemId = state?.lastItemId;

    // Extract new items
    const newItems = this.getNewItems(feed.items, lastItemId);

    if (newItems.length === 0) {
      // Update state (only check time)
      await this.store.setFeedState(url, feed.items[0].id);
      return;
    }

    // Notify new items (oldest first, max 5)
    const itemsToNotify = newItems.slice(-5).reverse();

    for (const item of itemsToNotify) {
      try {
        await this.discord.sendFeedItem(channelId, item, feed.title);
        // Wait a bit for rate limiting
        await sleep(500);
      } catch (error) {
        console.error(`Failed to send notification for ${item.link}:`, error);
      }
    }

    // Save latest item ID
    await this.store.setFeedState(url, feed.items[0].id);
  }

  // Extract new items (items after lastItemId)
  private getNewItems(items: FeedItem[], lastItemId?: string): FeedItem[] {
    if (!lastItemId) {
      // Don't notify on first run (only notify items after registration)
      return [];
    }

    const newItems: FeedItem[] = [];

    for (const item of items) {
      if (item.id === lastItemId) {
        break;
      }
      newItems.push(item);
    }

    return newItems;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
