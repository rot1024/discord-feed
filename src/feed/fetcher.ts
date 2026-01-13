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
        // Find the item with the latest pubDate, or fall back to first item
        const latestItem = this.findLatestItem(feed.items);
        try {
          await this.discord.sendFeedItem(channelId, latestItem, feed.title);
        } catch (error) {
          console.error(`Failed to send notification for ${latestItem.link}:`, error);
        }
        await this.store.setFeedState(url, latestItem.id, {
          title: feed.title,
          lastItemPubDate: latestItem.pubDate,
        });
        return { url, channelId, status: "first_run", newItems: 1 };
      }

      // Extract new items (sorted by pubDate, oldest first)
      const newItems = this.getNewItems(feed.items, lastItemId, state.lastItemPubDate);

      if (newItems.length === 0) {
        // Only write if title changed or error needs to be cleared
        if (state.title !== feed.title || state.error) {
          await this.store.setFeedState(url, currentFirstId, {
            title: feed.title,
            lastItemPubDate: state.lastItemPubDate,
          });
        }
        return { url, channelId, status: "no_updates" };
      }

      // Notify all new items (already sorted oldest first)
      for (const item of newItems) {
        try {
          await this.discord.sendFeedItem(channelId, item, feed.title);
          await sleep(500);
        } catch (error) {
          console.error(`Failed to send notification for ${item.link}:`, error);
        }
      }

      // Save latest item info (last item in sorted array is the newest)
      const latestItem = newItems[newItems.length - 1];
      await this.store.setFeedState(url, latestItem.id, {
        title: feed.title,
        lastItemPubDate: latestItem.pubDate,
      });
      return { url, channelId, status: "ok", newItems: newItems.length };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.setFeedError(url, message);
      return { url, channelId, status: "error", error: message };
    }
  }

  // Find the item with the latest pubDate
  private findLatestItem(items: FeedItem[]): FeedItem {
    let latest = items[0];
    let latestTime = latest.pubDate ? new Date(latest.pubDate).getTime() : 0;

    for (const item of items) {
      if (item.pubDate) {
        const itemTime = new Date(item.pubDate).getTime();
        if (itemTime > latestTime) {
          latest = item;
          latestTime = itemTime;
        }
      }
    }

    return latest;
  }

  // Extract new items based on pubDate (or ID as fallback)
  private getNewItems(
    items: FeedItem[],
    lastItemId: string,
    lastItemPubDate?: string
  ): FeedItem[] {
    const lastDate = lastItemPubDate ? new Date(lastItemPubDate).getTime() : null;

    const newItems = items.filter((item) => {
      // Skip if same ID as last item
      if (item.id === lastItemId) {
        return false;
      }

      // If we have both pubDates, use date comparison
      if (lastDate && item.pubDate) {
        const itemDate = new Date(item.pubDate).getTime();
        return itemDate > lastDate;
      }

      // No reliable date info - include if ID is different
      // This handles feeds without pubDate or first check after upgrade
      return true;
    });

    // Sort by pubDate ascending (oldest first) for notification order
    return newItems.sort((a, b) => {
      if (!a.pubDate || !b.pubDate) return 0;
      return new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime();
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
