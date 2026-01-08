<p align="center">
  <img src="icon.png" alt="discord-feed" width="128" height="128">
</p>

<h1 align="center">discord-feed</h1>

A Discord bot that monitors RSS/Atom feeds and posts updates to Discord channels, running on Cloudflare Workers.

## Features

- **Slash Commands**: Manage feeds with `/feed add`, `/feed remove`, `/feed list`, `/feed test`
- **Multi-server support**: Works across multiple Discord servers
- **RSS/Atom support**: Compatible with RSS 2.0, RSS 1.0 (RDF), and Atom feeds
- **OG preview**: Posts feed URLs that trigger Discord's rich link preview
- **Feed status**: Shows feed titles and error status in list command
- **Batch operations**: Add/remove multiple feeds at once
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

> **Note:** The bot needs permission to **view the channel** where you register feeds. If the channel is private, make sure the bot's role has access to it in the channel settings.

### 2. Create KV Namespace

```bash
npx wrangler kv namespace create FEED_KV
```

Copy the output ID and uncomment/update in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"
```

### 3. Deploy

```bash
npm install
npm run deploy
```

### 4. Set Secrets

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_APP_ID
npx wrangler secret put ADMIN_TOKEN  # Optional: protects /register and /trigger
```

### 5. Register Slash Commands

After deploying, register the slash commands by sending a POST request:

```bash
# Without ADMIN_TOKEN
curl -X POST https://discord-feed.<your-subdomain>.workers.dev/register

# With ADMIN_TOKEN
curl -X POST https://discord-feed.<your-subdomain>.workers.dev/register \
  -H "Authorization: Bearer <your-admin-token>"
```

### 6. Manually Trigger Feed Check (Optional)

You can manually trigger feed checking without waiting for the cron:

```bash
# Without ADMIN_TOKEN
curl -X POST https://discord-feed.<your-subdomain>.workers.dev/trigger

# With ADMIN_TOKEN
curl -X POST https://discord-feed.<your-subdomain>.workers.dev/trigger \
  -H "Authorization: Bearer <your-admin-token>"
```

### 7. Set Interactions Endpoint

In Discord Developer Portal, go to **General Information** and set:

```
Interactions Endpoint URL: https://discord-feed.<your-subdomain>.workers.dev/interactions
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/feed add <url>` | Register feeds (supports multiple URLs separated by spaces) |
| `/feed remove <url>` | Remove feeds by URL or number from list (supports multiple) |
| `/feed list` | List registered feeds with titles and error status |
| `/feed test <url>` | Test a feed by posting 1 item (accepts URL or number) |

### Examples

```
/feed add https://example.com/feed.xml
/feed add https://example.com/feed1.xml https://example.com/feed2.xml
/feed remove 1
/feed remove 1 2 3
/feed test 1
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
