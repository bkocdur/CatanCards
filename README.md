# Catan Development Cards (local helper)

Lightweight web app for the **base game** development deck: 25 cards (14 knights, 5 victory points, 2 road building, 2 year of plenty, 2 monopoly). Uses **localStorage** only.

## Deploy to Vercel from GitHub

1. Create a new repository on GitHub and push this folder (no build step required).
2. In [Vercel](https://vercel.com), import the repo.
3. Use defaults: **Framework Preset** “Other”, **Output** the repository root. Vercel serves `index.html` automatically.

## Local preview

```bash
cd /path/to/CatanCards
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Notes

- State is **per browser**. The same “game name” on another phone does not sync unless you use a shared device or future backend.
- Pass-and-play: use **Menu → Switch player** or **Add another player** (game name stays locked when adding a seat).
- Design tokens and layout follow the **Tactile Heritage** Stitch reference (`stitch (2).zip`).
