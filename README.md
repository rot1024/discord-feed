# discord-feed

A Discord bot that monitors RSS/Atom feeds and posts updates to Discord channels, running on Cloudflare Workers.

## Features

- **Slash Commands**: Manage feeds with `/feed add`, `/feed remove`, `/feed list`
- **Multi-server support**: Works across multiple Discord servers
- **RSS/Atom support**: Compatible with RSS 2.0, RSS 1.0 (RDF), and Atom feeds
- **Rich embeds**: Posts feed updates as Discord embeds with title, description, and link
- **Serverless**: Runs on Cloudflare Workers with KV storage

## Setup

### 1. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** section and create a bot
4. Copy the **Bot Token**
5. Go to **General Information** and copy the **Application ID** and **Public Key**
6. Go to **OAuth2 > URL Generator**:
   - Select scopes: `bot`, `applications.commands`
   - Select bot permissions: `Send Messages`
7. Use the generated URL to invite the bot to your server

### 2. Create KV Namespace

```bash
wrangler kv namespace create FEED_KV
```

Copy the output ID and set it in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"
```

### 3. Set Secrets

```bash
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_APP_ID
```

### 4. Deploy

```bash
npm install
npm run deploy
```

### 5. Register Slash Commands

After deploying, register the slash commands by sending a POST request:

```bash
curl -X POST https://discord-feed.<your-subdomain>.workers.dev/register
```

### 6. Set Interactions Endpoint

In Discord Developer Portal, go to **General Information** and set:

```
Interactions Endpoint URL: https://discord-feed.<your-subdomain>.workers.dev/interactions
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/feed add <url>` | Register a feed to the current channel |
| `/feed remove <url>` | Remove a feed from the current channel |
| `/feed list` | List all registered feeds in the current channel |

### Example

```
/feed add https://example.com/feed.xml
```

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Type check
npm run typecheck

# Deploy
npm run deploy
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│  Discord User   │────▶│ Cloudflare Worker│
│ (Slash Command) │     │                  │
└─────────────────┘     │  - Hono (HTTP)   │
                        │  - KV (Storage)  │
┌─────────────────┐     │  - Cron (15min)  │
│  Cron Trigger   │────▶│                  │
└─────────────────┘     └────────┬─────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Discord API    │
                        └─────────────────┘
```

## License

MIT
