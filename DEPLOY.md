# Deployment Guide

This repo contains two surfaces:

- `/` is the public sales page.
- `/dashboard` is the local app dashboard.

For public marketing, deploy only the sales surface. Do not expose the local dashboard publicly.

## Recommended Setup

Use Vercel, Netlify, Render, or another simple Node/Next host for the sales page.

Set these environment variables on the host:

```bash
NEXT_PUBLIC_PRODUCT_PRICE=$20
NEXT_PUBLIC_PURCHASE_URL=https://your-payment-link.example
MARKETING_ONLY=true
```

`MARKETING_ONLY=true` redirects `/dashboard` and `/api/*` back to `/` so the public deployment behaves like a sales site, not a hosted app.

## Payment Providers

Use one hosted checkout provider:

- Stripe Payment Links
- Gumroad
- Lemon Squeezy
- Polar

After purchase, deliver either:

- a release ZIP from `npm run release`, or
- access to a private GitHub repo/release.

## Build

```bash
npm install
npm run build
```

This project uses a small wrapper around Next build/dev to use the installed WASM SWC compiler. That avoids local macOS native SWC code-signing issues.

## Local App

Buyers should run the app locally after downloading it:

```bash
npm install
cp .env.example .env
npm run setup
npm run x:login
npm run dev
```

Then open:

```text
http://localhost:3000/dashboard
```
