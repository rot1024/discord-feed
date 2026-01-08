import { XMLParser } from "fast-xml-parser";
import type { FeedItem, ParsedFeed } from "../types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

// Parse RSS/Atom feed
export function parseFeed(xml: string): ParsedFeed {
  const parsed = parser.parse(xml);

  // RSS 2.0
  if (parsed.rss?.channel) {
    return parseRss(parsed.rss.channel);
  }

  // Atom
  if (parsed.feed) {
    return parseAtom(parsed.feed);
  }

  // RSS 1.0 (RDF)
  if (parsed["rdf:RDF"]) {
    return parseRdf(parsed["rdf:RDF"]);
  }

  throw new Error("Unknown feed format");
}

// Parse RSS 2.0
function parseRss(channel: RssChannel): ParsedFeed {
  const items = Array.isArray(channel.item)
    ? channel.item
    : channel.item
      ? [channel.item]
      : [];

  return {
    title: channel.title || "Unknown Feed",
    link: channel.link || "",
    items: items.map((item): FeedItem => {
      const id = getText(item.guid) || item.link || "";
      return {
        id: String(id),
        title: item.title || "No title",
        link: item.link || "",
        description: item.description,
        pubDate: parseDate(item.pubDate),
        image: extractImageFromRssItem(item),
      };
    }),
  };
}

// Parse Atom
function parseAtom(feed: AtomFeed): ParsedFeed {
  const entries = Array.isArray(feed.entry)
    ? feed.entry
    : feed.entry
      ? [feed.entry]
      : [];

  const feedLink = Array.isArray(feed.link)
    ? feed.link.find((l) => l["@_rel"] === "alternate" || !l["@_rel"])?.["@_href"]
    : feed.link?.["@_href"];

  return {
    title: getText(feed.title) || "Unknown Feed",
    link: feedLink || "",
    items: entries.map((entry): FeedItem => {
      const entryLink = Array.isArray(entry.link)
        ? entry.link.find((l) => l["@_rel"] === "alternate" || !l["@_rel"])?.["@_href"]
        : entry.link?.["@_href"];

      return {
        id: entry.id || entryLink || "",
        title: getText(entry.title) || "No title",
        link: entryLink || "",
        description: getText(entry.summary) || getText(entry.content),
        pubDate: parseDate(entry.published || entry.updated),
        image: extractImageFromAtomEntry(entry),
      };
    }),
  };
}

// Parse RSS 1.0 (RDF)
function parseRdf(rdf: RdfFeed): ParsedFeed {
  const items = Array.isArray(rdf.item)
    ? rdf.item
    : rdf.item
      ? [rdf.item]
      : [];

  return {
    title: rdf.channel?.title || "Unknown Feed",
    link: rdf.channel?.link || "",
    items: items.map((item): FeedItem => ({
      id: item["@_rdf:about"] || item.link || "",
      title: item.title || "No title",
      link: item.link || "",
      description: item.description,
      pubDate: parseDate(item["dc:date"]),
      image: extractImageFromRdfItem(item),
    })),
  };
}

// Convert date string to ISO8601
function parseDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return undefined;
    return date.toISOString();
  } catch {
    return undefined;
  }
}

// Get text from string or object
function getText(value?: string | { "#text": string }): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value["#text"];
}

// Extract image URL from RSS item
function extractImageFromRssItem(item: RssItem): string | undefined {
  // Check enclosure with image type
  if (item.enclosure?.["@_type"]?.startsWith("image/")) {
    return item.enclosure["@_url"];
  }
  // Check media:content
  if (item["media:content"]?.["@_url"]) {
    const media = item["media:content"];
    if (!media["@_type"] || media["@_type"].startsWith("image/")) {
      return media["@_url"];
    }
  }
  // Check media:thumbnail
  if (item["media:thumbnail"]?.["@_url"]) {
    return item["media:thumbnail"]["@_url"];
  }
  return undefined;
}

// Extract image URL from Atom entry
function extractImageFromAtomEntry(entry: AtomEntry): string | undefined {
  // Check link with enclosure rel and image type
  const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : [];
  const imageLink = links.find(
    (l) => l["@_rel"] === "enclosure" && l["@_type"]?.startsWith("image/")
  );
  if (imageLink?.["@_href"]) {
    return imageLink["@_href"];
  }
  // Check media:content
  if (entry["media:content"]?.["@_url"]) {
    const media = entry["media:content"];
    if (!media["@_type"] || media["@_type"].startsWith("image/")) {
      return media["@_url"];
    }
  }
  // Check media:thumbnail
  if (entry["media:thumbnail"]?.["@_url"]) {
    return entry["media:thumbnail"]["@_url"];
  }
  return undefined;
}

// Extract image URL from RDF item
function extractImageFromRdfItem(item: RdfItem): string | undefined {
  // Check media:content
  if (item["media:content"]?.["@_url"]) {
    const media = item["media:content"];
    if (!media["@_type"] || media["@_type"].startsWith("image/")) {
      return media["@_url"];
    }
  }
  // Check media:thumbnail
  if (item["media:thumbnail"]?.["@_url"]) {
    return item["media:thumbnail"]["@_url"];
  }
  return undefined;
}

// Type definitions for fast-xml-parser output
interface RssChannel {
  title?: string;
  link?: string;
  item?: RssItem | RssItem[];
}

interface RssItem {
  guid?: string | { "#text": string };
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  enclosure?: {
    "@_url"?: string;
    "@_type"?: string;
  };
  "media:content"?: MediaContent;
  "media:thumbnail"?: MediaContent;
}

interface MediaContent {
  "@_url"?: string;
  "@_type"?: string;
}

interface AtomFeed {
  title?: string | { "#text": string };
  link?: AtomLink | AtomLink[];
  entry?: AtomEntry | AtomEntry[];
}

interface AtomLink {
  "@_href"?: string;
  "@_rel"?: string;
  "@_type"?: string;
}

interface AtomEntry {
  id?: string;
  title?: string | { "#text": string };
  link?: AtomLink | AtomLink[];
  summary?: string | { "#text": string };
  content?: string | { "#text": string };
  published?: string;
  updated?: string;
  "media:content"?: MediaContent;
  "media:thumbnail"?: MediaContent;
}

interface RdfFeed {
  channel?: {
    title?: string;
    link?: string;
  };
  item?: RdfItem | RdfItem[];
}

interface RdfItem {
  "@_rdf:about"?: string;
  title?: string;
  link?: string;
  description?: string;
  "dc:date"?: string;
  "media:content"?: MediaContent;
  "media:thumbnail"?: MediaContent;
}
