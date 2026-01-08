import type { FeedConfig, FeedIndex, FeedState } from "../types";

// Encode URL to base64 for KV key
function encodeUrl(url: string): string {
  return btoa(url).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// KV key generators
const keys = {
  feedConfig: (guildId: string, channelId: string, url: string) =>
    `feed:${guildId}:${channelId}:${encodeUrl(url)}`,
  feedIndex: (guildId: string, channelId: string) =>
    `feeds:${guildId}:${channelId}`,
  feedState: (url: string) => `state:${encodeUrl(url)}`,
  allFeedIndexes: () => "feeds:",
};

export class FeedStore {
  constructor(private kv: KVNamespace) {}

  // Save feed configuration
  async addFeed(
    guildId: string,
    channelId: string,
    url: string,
    addedBy: string
  ): Promise<void> {
    const config: FeedConfig = {
      url,
      addedAt: new Date().toISOString(),
      addedBy,
    };

    // Save feed config
    await this.kv.put(
      keys.feedConfig(guildId, channelId, url),
      JSON.stringify(config)
    );

    // Update index
    const index = await this.getFeedIndex(guildId, channelId);
    if (!index.urls.includes(url)) {
      index.urls.push(url);
      await this.kv.put(
        keys.feedIndex(guildId, channelId),
        JSON.stringify(index)
      );
    }
  }

  // Remove feed configuration
  async removeFeed(
    guildId: string,
    channelId: string,
    url: string
  ): Promise<boolean> {
    const index = await this.getFeedIndex(guildId, channelId);
    const urlIndex = index.urls.indexOf(url);

    if (urlIndex === -1) {
      return false;
    }

    // Delete feed config
    await this.kv.delete(keys.feedConfig(guildId, channelId, url));

    // Update index
    index.urls.splice(urlIndex, 1);
    await this.kv.put(
      keys.feedIndex(guildId, channelId),
      JSON.stringify(index)
    );

    return true;
  }

  // Get feed index for a channel
  async getFeedIndex(guildId: string, channelId: string): Promise<FeedIndex> {
    const data = await this.kv.get(keys.feedIndex(guildId, channelId));
    if (!data) {
      return { urls: [] };
    }
    return JSON.parse(data) as FeedIndex;
  }

  // Get all feed indexes (for cron job)
  async getAllFeedIndexes(): Promise<
    Array<{ guildId: string; channelId: string; urls: string[] }>
  > {
    const result: Array<{
      guildId: string;
      channelId: string;
      urls: string[];
    }> = [];

    const list = await this.kv.list({ prefix: keys.allFeedIndexes() });

    for (const key of list.keys) {
      // Parse feeds:{guildId}:{channelId}
      const parts = key.name.split(":");
      if (parts.length === 3) {
        const guildId = parts[1];
        const channelId = parts[2];
        const index = await this.getFeedIndex(guildId, channelId);
        if (index.urls.length > 0) {
          result.push({ guildId, channelId, urls: index.urls });
        }
      }
    }

    return result;
  }

  // Get feed state
  async getFeedState(url: string): Promise<FeedState | null> {
    const data = await this.kv.get(keys.feedState(url));
    if (!data) {
      return null;
    }
    return JSON.parse(data) as FeedState;
  }

  // Save feed state
  async setFeedState(
    url: string,
    lastItemId: string,
    options?: { title?: string; error?: string }
  ): Promise<void> {
    const state: FeedState = {
      lastItemId,
      lastCheckedAt: new Date().toISOString(),
      title: options?.title,
      error: options?.error,
    };
    await this.kv.put(keys.feedState(url), JSON.stringify(state));
  }

  // Save feed error state
  async setFeedError(url: string, error: string): Promise<void> {
    const existing = await this.getFeedState(url);
    const state: FeedState = {
      lastItemId: existing?.lastItemId ?? "",
      lastCheckedAt: new Date().toISOString(),
      title: existing?.title,
      error,
    };
    await this.kv.put(keys.feedState(url), JSON.stringify(state));
  }
}
