# Buyer Guide

Personal X Operator is a local-first X engagement assistant. It runs on your machine, uses your own browser session, and stores history in a local SQLite database.

## What You Need

- Node.js 24 or newer
- An X account
- A terminal
- Optional: an OpenAI API key for richer generated writing

OpenAI is not required. The default local curator mode works without API credits.

## Install

```bash
npm install
cp .env.example .env
npm run setup
```

## Start The Dashboard

```bash
npm run dev
```

Open:

```text
http://localhost:3000/dashboard
```

## Log Into X

Run:

```bash
npm run x:login
```

A browser opens. Log into X manually. The session is saved locally in `data/x-session`.

## First Safe Test

Keep these settings in `.env`:

```bash
MOCK_AI=true
AUTO_POST_ENABLED=false
AUTO_REPLY_ENABLED=false
```

Then in the dashboard:

1. Click **Open X browser**.
2. Click **Generate post draft**.
3. Click **Scan and draft replies**.
4. Review the dashboard history.

Nothing posts live until you enable live posting or live replies.

## Live Mode

Live mode uses your logged-in X browser session to publish.

- **Enable live posting** allows generated posts to publish.
- **Enable live replies** allows qualifying replies to publish.

Use low daily limits first:

```bash
POSTS_PER_DAY=3
REPLIES_PER_DAY=5
MIN_REPLY_SCORE=8
```

## Personalize It

Edit these files:

- `brain.md`: account identity and worldview
- `ideas.md`: post ideas
- `style.md`: writing style
- `forbidden.md`: topics/actions to avoid
- `targets.md`: accounts and posts to engage with

## Important Boundaries

This is not a follower bot. It does not follow or unfollow accounts. It does not guarantee followers, engagement, sales, or account safety.

You are responsible for the activity performed through your X account.

## Troubleshooting

If the X browser opens blank, close any Chrome for Testing windows and click **Open X browser** again.

If X asks you to log in again, run:

```bash
npm run x:login
```

If the dashboard does not load, restart the dev server:

```bash
npm run dev
```
