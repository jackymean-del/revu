# revU marketing site

The public website: a Next.js static export (`out/`) served by Cloudflare
Pages (project `revu-marketing`) at revu.bhusku.com, as schedU's site is.
The app lives at app.revu.bhusku.com and every sign-in link goes there.

```bash
npm install
npm run dev                  # http://localhost:3000
npm run build                # out/
npx tsx content-verify.mts   # after a build: style, titles, links, own-words table
```

- What revU does is written once, in `content/product.ts`. Each feature says
  whether it is live or arrives in the pilot; keep that true.
- The font lives in `app/fonts`, so nothing is downloaded at build time.
- Nothing here imports from outside this folder: Cloudflare builds it alone.
  content-verify.mts reads the app's presets only when they are beside it.
