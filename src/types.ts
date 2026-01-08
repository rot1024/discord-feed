// Feed configuration stored in KV
export interface FeedConfig {
  url: string;
  addedAt: string; // ISO8601
  addedBy: string; // Discord userId
}

// Feed index per channel stored in KV
export interface FeedIndex {
  urls: string[];
}

// Feed state stored in KV
export interface FeedState {
  lastItemId: string; // guid or link of the latest item
  lastCheckedAt: string; // ISO8601
}

// Parsed feed item
export interface FeedItem {
  id: string; // guid or link
  title: string;
  link: string;
  description?: string;
  pubDate?: string; // ISO8601
}

// Parsed feed
export interface ParsedFeed {
  title: string;
  link: string;
  items: FeedItem[];
}

// Discord Embed
export interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  color?: number;
  footer?: {
    text: string;
  };
  timestamp?: string;
}

// Environment variables
export interface Env {
  KV: KVNamespace;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_APP_ID: string;
  ADMIN_TOKEN?: string; // Optional token for /register and /trigger
}
