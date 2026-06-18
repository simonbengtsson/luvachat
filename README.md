# Luvachat

<a target="_blank" href="https://luvabase.com/apps/luvachat/install"><img src="https://luvabase.com/deploy.svg" alt="Deploy to Luvabase"/></a>
<a target="_blank" href="https://deploy.workers.cloudflare.com/?url=https://github.com/simonbengtsson/luvachat"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"/></a>

🌎 Team messaging with channels, DMs, threads, and search.<br>
💬 Rich text messages, emoji reactions, file attachments, and push notifications.<br>
❤️ Open source and self-hostable on Luvabase and Cloudflare.<br>

## What is Luvachat?

Luvachat is your self-hostable team chat app. Think Slack, but smaller and built for teams that want workspace messaging they can run themselves. It includes channels, direct conversations, threaded replies, activity, message search, rich text, and attachments.

## Getting started

The easiest way to use Luvachat is to [install it on Luvabase](https://luvabase.com/apps/luvachat/install). On Luvabase authentication and workspace members are managed for you.

You can also [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/simonbengtsson/luvachat) and run Luvachat on your own Cloudflare account.

For local development:

```bash
bun install
bun run dev
```

## Stack

Luvachat is built as a TanStack Start app with a real-time sync and persistence layer on Cloudflare Durable Objects.

- Server: Cloudflare Durable Objects, Worker, R2, ORPC, Drizzle
- Client: React, Shadcn, TanStack Router, TanStack Query, Tailwind
- Rich text editing with [Tiptap](https://tiptap.dev)

## Contributions

Very much welcome! The goal is to keep Luvachat focused and easy to self-host, but below are some examples of what would be in scope:

- Better unread and notification controls
- More powerful search filters
- Message editing and deletion
- Workspace administration screens
- Improved thread and conversation summaries
