# Live US Stock Dashboard (Static Website)

A lightweight dashboard built with plain HTML, CSS, and JavaScript for:

- Live/near-real-time US stock quotes (includes **WDC** by default)
- US Eastern and New Zealand clocks
- US market open/close status + countdown
- Trading calendar view (today's status + next 5 trading days)

## APIs Used

1. **Alpha Vantage** (stock quotes)
   - Endpoint used: `GLOBAL_QUOTE`
   - Site: https://www.alphavantage.co/
   - Requires API key (free tier available)

2. **Nager.Date** (US public holidays)
   - Endpoint used: `/api/v3/PublicHolidays/{year}/US`
   - Site: https://date.nager.at/
   - No API key required

> Note: The holiday feed is used as a practical public dataset to approximate major US market holidays.

## Local Test Instructions

Because this project uses `fetch`, run it with a local static server instead of opening `index.html` directly.

### Option A: Python

```bash
cd stock-dashboard
python3 -m http.server 8080
```

Then open: `http://localhost:8080`

### Option B: VS Code Live Server

- Open folder in VS Code
- Start "Live Server"
- Browse to the generated localhost URL

## Setup

1. Open `app.js`
2. Replace:

```js
const ALPHA_VANTAGE_API_KEY = "YOUR_ALPHA_VANTAGE_API_KEY";
```

with your real API key.

3. Optionally edit `STOCK_SYMBOLS` in `app.js`.

## Deploy on GitHub Pages

1. Commit and push this folder to GitHub.
2. In GitHub repo settings:
   - Go to **Settings → Pages**
   - Under **Build and deployment**, choose **Deploy from a branch**
3. Select your branch (for example `main`).
4. Choose folder:
   - `/root` if dashboard files are in repository root, or
   - `/docs` if you place this dashboard under a `docs` folder.
5. Save and wait for deployment.
6. Open the provided GitHub Pages URL.

