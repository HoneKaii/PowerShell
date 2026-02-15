/**
 * Live US Stock Dashboard
 *
 * API choices used in this example:
 * 1) Stock prices: Alpha Vantage GLOBAL_QUOTE endpoint (free tier available with API key).
 *    Docs: https://www.alphavantage.co/documentation/
 * 2) Holiday calendar: Nager.Date public holidays API (free, no auth) for United States.
 *    Docs: https://date.nager.at/
 *
 * GitHub Pages note:
 * - This is a static site (HTML/CSS/JS only), so it is directly deployable to GitHub Pages.
 * - Add your Alpha Vantage API key below before deployment.
 */

const ALPHA_VANTAGE_API_KEY = "YOUR_ALPHA_VANTAGE_API_KEY"; // <-- Replace with your own key.
const STOCK_SYMBOLS = ["WDC", "AAPL", "MSFT"];
const STOCK_REFRESH_MS = 60_000; // Refresh every 60 seconds.

const usDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const etTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  weekday: "short",
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const nztTimeFormatter = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  weekday: "short",
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const stocksBody = document.getElementById("stocks-body");
const stocksTable = document.getElementById("stocks-table");
const stocksLoading = document.getElementById("stocks-loading");
const stocksError = document.getElementById("stocks-error");
const refreshStocksBtn = document.getElementById("refresh-stocks");

const etTimeEl = document.getElementById("et-time");
const nztTimeEl = document.getElementById("nzt-time");
const marketStatusEl = document.getElementById("market-status");
const marketCountdownEl = document.getElementById("market-countdown");

const calendarLoadingEl = document.getElementById("calendar-loading");
const calendarErrorEl = document.getElementById("calendar-error");
const todayMarketStatusEl = document.getElementById("today-market-status");
const tradingDaysListEl = document.getElementById("trading-days-list");

let usHolidaySet = new Set(); // Stores YYYY-MM-DD for holiday lookups.

function toEtParts(date = new Date()) {
  // Returns ET date/time parts using Intl so it works correctly across DST.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const part = (type) => parts.find((p) => p.type === type)?.value;

  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
    second: Number(part("second")),
  };
}

function formatYyyyMmDdFromParts(parts) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function isWeekendFromParts(parts) {
  // Build a UTC date based on ET-local y/m/d to get weekday consistently.
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function isTradingDayFromParts(parts) {
  const dateKey = formatYyyyMmDdFromParts(parts);
  return !isWeekendFromParts(parts) && !usHolidaySet.has(dateKey);
}

function isMarketOpenNow() {
  const parts = toEtParts();
  if (!isTradingDayFromParts(parts)) {
    return false;
  }

  const minutes = parts.hour * 60 + parts.minute;
  const openMinutes = 9 * 60 + 30;
  const closeMinutes = 16 * 60;
  return minutes >= openMinutes && minutes < closeMinutes;
}

function etPartsToEtDateDisplay(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getNextMarketBoundary() {
  // Works in ET-local arithmetic via date parts.
  let parts = toEtParts();
  let minutes = parts.hour * 60 + parts.minute;
  const openMinutes = 9 * 60 + 30;
  const closeMinutes = 16 * 60;

  // If open now, next boundary is close today.
  if (isTradingDayFromParts(parts) && minutes >= openMinutes && minutes < closeMinutes) {
    return {
      type: "close",
      target: { ...parts, hour: 16, minute: 0, second: 0 },
    };
  }

  // Otherwise find next trading day open (today at 9:30 if before open on trading day).
  if (isTradingDayFromParts(parts) && minutes < openMinutes) {
    return {
      type: "open",
      target: { ...parts, hour: 9, minute: 30, second: 0 },
    };
  }

  // Move forward day-by-day until next trading day.
  let probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  while (true) {
    probe.setUTCDate(probe.getUTCDate() + 1);
    const nextParts = {
      year: probe.getUTCFullYear(),
      month: probe.getUTCMonth() + 1,
      day: probe.getUTCDate(),
      hour: 9,
      minute: 30,
      second: 0,
    };

    if (isTradingDayFromParts(nextParts)) {
      return { type: "open", target: nextParts };
    }
  }
}

function secondsUntilEtTarget(target) {
  // Approximate remaining time by converting ET parts to local Date components in UTC.
  // This keeps logic simple for a static client app.
  const now = new Date();
  const nowEt = toEtParts(now);
  const nowEtDate = Date.UTC(
    nowEt.year,
    nowEt.month - 1,
    nowEt.day,
    nowEt.hour,
    nowEt.minute,
    nowEt.second
  );

  const targetEtDate = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second
  );

  return Math.max(0, Math.floor((targetEtDate - nowEtDate) / 1000));
}

function formatCountdown(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hhmmss = [hours, minutes, seconds].map((v) => String(v).padStart(2, "0")).join(":");
  return days > 0 ? `${days}d ${hhmmss}` : hhmmss;
}

function updateClocksAndMarketStatus() {
  const now = new Date();
  etTimeEl.textContent = etTimeFormatter.format(now);
  nztTimeEl.textContent = nztTimeFormatter.format(now);

  const open = isMarketOpenNow();
  marketStatusEl.textContent = open ? "US Market: OPEN" : "US Market: CLOSED";
  marketStatusEl.classList.toggle("open", open);
  marketStatusEl.classList.toggle("closed", !open);

  const nextBoundary = getNextMarketBoundary();
  const secs = secondsUntilEtTarget(nextBoundary.target);
  const boundaryLabel = nextBoundary.type === "open" ? "next open" : "next close";
  marketCountdownEl.textContent = `Countdown to ${boundaryLabel}: ${formatCountdown(secs)} (${etPartsToEtDateDisplay(nextBoundary.target)} ET)`;
}

async function fetchQuote(symbol) {
  // Alpha Vantage GLOBAL_QUOTE returns latest quote for one symbol.
  // Free tier has rate limits; for many symbols use slower refresh intervals.
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", ALPHA_VANTAGE_API_KEY);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Quote request failed (${response.status})`);
  }

  const json = await response.json();
  const q = json["Global Quote"];

  if (!q || !q["05. price"]) {
    if (json.Note) {
      throw new Error("API limit reached. Try a longer refresh interval or use fewer symbols.");
    }
    throw new Error(`No quote data returned for ${symbol}.`);
  }

  return {
    symbol,
    price: Number(q["05. price"]),
    changePercent: Number(String(q["10. change percent"]).replace("%", "")),
    timestamp: new Date(),
  };
}

function renderStocks(quotes) {
  stocksBody.innerHTML = "";

  quotes.forEach((quote) => {
    const tr = document.createElement("tr");

    const trendClass = quote.changePercent > 0 ? "positive" : quote.changePercent < 0 ? "negative" : "warning";
    const signedPct = `${quote.changePercent > 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`;

    tr.innerHTML = `
      <td><strong>${quote.symbol}</strong></td>
      <td>$${quote.price.toFixed(2)}</td>
      <td class="${trendClass}">${signedPct}</td>
      <td>${usDateFormatter.format(quote.timestamp)}</td>
    `;

    stocksBody.appendChild(tr);
  });

  stocksLoading.classList.add("hidden");
  stocksTable.classList.remove("hidden");
}

async function loadStockPrices() {
  stocksError.classList.add("hidden");
  stocksLoading.classList.remove("hidden");

  if (!ALPHA_VANTAGE_API_KEY || ALPHA_VANTAGE_API_KEY === "YOUR_ALPHA_VANTAGE_API_KEY") {
    stocksLoading.classList.add("hidden");
    stocksError.classList.remove("hidden");
    stocksError.textContent = "Please add your Alpha Vantage API key in app.js to load live prices.";
    return;
  }

  try {
    const quotes = [];
    for (const symbol of STOCK_SYMBOLS) {
      // Sequential fetch to stay friendly with API rate limits.
      const quote = await fetchQuote(symbol);
      quotes.push(quote);
    }

    renderStocks(quotes);
  } catch (error) {
    stocksLoading.classList.add("hidden");
    stocksError.classList.remove("hidden");
    stocksError.textContent = `Could not load stock data: ${error.message}`;
  }
}

async function fetchUsHolidays(year) {
  // Nager.Date endpoint:
  // GET /api/v3/PublicHolidays/{year}/{countryCode}
  // Returns holiday objects with `date` (YYYY-MM-DD) and `localName`.
  const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`);
  if (!response.ok) {
    throw new Error(`Holiday request failed (${response.status})`);
  }

  return response.json();
}

function getTodayEtParts() {
  return toEtParts();
}

function addDaysYyyyMmDd(parts, daysToAdd) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function describeTodayStatus(todayParts) {
  const open = isMarketOpenNow();
  const tradingDay = isTradingDayFromParts(todayParts);

  if (!tradingDay) {
    return `Today (${formatYyyyMmDdFromParts(todayParts)} ET): Market Closed (Weekend or holiday)`;
  }

  return `Today (${formatYyyyMmDdFromParts(todayParts)} ET): ${open ? "Market Open" : "Market Closed (outside regular hours)"}`;
}

function getNextTradingDays(startParts, count = 5) {
  const days = [];
  let offset = 0;

  while (days.length < count) {
    const candidate = addDaysYyyyMmDd(startParts, offset);
    if (isTradingDayFromParts(candidate)) {
      days.push(candidate);
    }
    offset += 1;
  }

  return days;
}

function renderTradingDays(days) {
  tradingDaysListEl.innerHTML = "";

  days.forEach((parts, index) => {
    const li = document.createElement("li");
    const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    li.textContent = `${index + 1}. ${d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} (Trading Day)`;
    tradingDaysListEl.appendChild(li);
  });
}

async function loadMarketCalendar() {
  calendarErrorEl.classList.add("hidden");
  calendarLoadingEl.classList.remove("hidden");

  try {
    const todayEt = getTodayEtParts();
    const currentYear = todayEt.year;

    // Fetch this year + next year to safely compute upcoming trading days near year-end.
    const [holidaysThisYear, holidaysNextYear] = await Promise.all([
      fetchUsHolidays(currentYear),
      fetchUsHolidays(currentYear + 1),
    ]);

    usHolidaySet = new Set([...holidaysThisYear, ...holidaysNextYear].map((h) => h.date));

    todayMarketStatusEl.textContent = describeTodayStatus(todayEt);
    const nextTradingDays = getNextTradingDays(todayEt, 5);
    renderTradingDays(nextTradingDays);

    calendarLoadingEl.classList.add("hidden");
  } catch (error) {
    calendarLoadingEl.classList.add("hidden");
    calendarErrorEl.classList.remove("hidden");
    calendarErrorEl.textContent = `Could not load market calendar: ${error.message}`;
  }
}

function init() {
  updateClocksAndMarketStatus();
  setInterval(updateClocksAndMarketStatus, 1000);

  loadMarketCalendar().then(() => {
    // Re-evaluate market state after holiday data is loaded.
    updateClocksAndMarketStatus();
  });

  loadStockPrices();
  setInterval(loadStockPrices, STOCK_REFRESH_MS);

  refreshStocksBtn.addEventListener("click", loadStockPrices);
}

init();
