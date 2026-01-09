import type { FeedStore } from "../kv/store";
import type { DiscordAPI } from "../discord/api";
import type { FeedItem } from "../types";
import { parseFeed } from "./parser";

export interface FeedCheckResult {
  url: string;
  channelId: string;
  status: "ok" | "error" | "first_run" | "no_updates";
  newItems?: number;
  error?: string;
}

export interface CheckAllFeedsResult {
  totalFeeds: number;
  results: FeedCheckResult[];
}

export class FeedFetcher {
  constructor(
    private store: FeedStore,
    private discord: DiscordAPI
  ) {}

  // Check all feeds and notify new items
  async checkAllFeeds(): Promise<CheckAllFeedsResult> {
    const indexes = await this.store.getAllFeedIndexes();
    const results: FeedCheckResult[] = [];

    for (const { channelId, urls } of indexes) {
      for (const url of urls) {
        const result = await this.checkFeed(url, channelId);
        results.push(result);
      }
    }

    return {
      totalFeeds: results.length,
      results,
    };
  }

  // Check a single feed
  private async checkFeed(url: string, channelId: string): Promise<FeedCheckResult> {
    try {
      // Fetch feed
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Discord-Feed-Bot/1.0",
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
      });

      if (!response.ok) {
        const error = `HTTP ${response.status}`;
        await this.store.setFeedError(url, error);
        return { url, channelId, status: "error", error };
      }

      const xml = await response.text();
      const feed = parseFeed(xml);

      if (feed.items.length === 0) {
        return { url, channelId, status: "ok", newItems: 0 };
      }

      // Get previous state
      const state = await this.store.getFeedState(url);
      const lastItemId = state?.lastItemId;
      const currentFirstId = feed.items[0].id;

      console.log(`Checking feed: url=${url}, lastItemId=${lastItemId ?? "(none)"}, currentFirstId=${currentFirstId}`);

      // First run - notify latest item and save state
      if (!lastItemId) {
        const latestItem = feed.items[0];
        try {
          await this.discord.sendFeedItem(channelId, latestItem, feed.title);
        } catch (error) {
          console.error(`Failed to send notification for ${latestItem.link}:`, error);
        }
        await this.store.setFeedState(url, currentFirstId, { title: feed.title });
        return { url, channelId, status: "first_run", newItems: 1 };
      }

      // Extract new items
      const newItems = this.getNewItems(feed.items, lastItemId);

      if (newItems.length === 0) {
        // Only write if title changed or error needs to be cleared
        if (state.title !== feed.title || state.error) {
          await this.store.setFeedState(url, currentFirstId, { title: feed.title });
        }
        return { url, channelId, status: "no_updates" };
      }

      // Notify new items (oldest first, max 5)
      const itemsToNotify = newItems.slice(-5).reverse();

      for (const item of itemsToNotify) {
        try {
          await this.discord.sendFeedItem(channelId, item, feed.title);
          await sleep(500);
        } catch (error) {
          console.error(`Failed to send notification for ${item.link}:`, error);
        }
      }

      // Save latest item ID
      await this.store.setFeedState(url, feed.items[0].id, { title: feed.title });
      return { url, channelId, status: "ok", newItems: itemsToNotify.length };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.setFeedError(url, message);
      return { url, channelId, status: "error", error: message };
    }
  }

  // Extract new items (items after lastItemId)
  private getNewItems(items: FeedItem[], lastItemId: string): FeedItem[] {
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
