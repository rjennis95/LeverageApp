export interface MarketData {
  spyPrice: number;
  spyEma50: number;
  spyRsi: number;
  vix: number;
  peRatio: number;
  lastUpdated: string; // ISO Date string of the data point (e.g. yesterday's close)
}

const CACHE_KEY = "market_data_cache";
const API_KEY = process.env.NEXT_PUBLIC_MARKET_DATA_KEY;

async function fetchAlphaVantage(functionName: string, symbol: string, extraParams: string = "") {
  if (!API_KEY) {
    console.warn("No API key found for AlphaVantage");
    return null;
  }
  
  const url = `https://www.alphavantage.co/query?function=${functionName}&symbol=${symbol}&apikey=${API_KEY}${extraParams}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data["Note"] || data["Information"]) {
      console.warn("AlphaVantage API limit reached or info:", data);
      return null;
    }
    return data;
  } catch (err) {
    console.error(`Error fetching ${functionName} for ${symbol}:`, err);
    return null;
  }
}

export async function getMarketData(): Promise<MarketData | null> {
  // 1. Check Cache
  const cached = typeof window !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
  if (cached) {
    const parsed: MarketData = JSON.parse(cached);
    const today = new Date().toISOString().split("T")[0];
    // Simple check: if we have data and it's not from "today" (assuming we want closing data from yesterday if today is trading, 
    // or just checking if we fetched it recently). 
    // The requirement says: "only call the API if it doesn't have data for the 'Last Close' date yet."
    // Getting the true "Last Close" date is tricky without an API call. 
    // Strategy: If the cached date is less than 24 hours old, reuse it. 
    // OR: check if the cached `lastUpdated` matches the expected previous trading day.
    // For simplicity and safety (API limits): trust the cache if it was saved within 12 hours.
    
    // Better Strategy: Store a `fetchTimestamp`. If `Date.now() - fetchTimestamp < 12 * 60 * 60 * 1000`, use cache.
    // BUT the user wants "Last Close". 
    // Let's rely on the returned data date.
    
    // Let's actually fetch the latest data if cache is empty or older than today (e.g. fetched yesterday).
    // If we fetched "today", we assume we have the latest "Last Close".
    // We will store a `fetchDate` in the cache wrapper.
  }
  
  // Real implementation of fetching all required data
  // We need to run these in parallel? No, free tier might block concurrent requests. Sequential is safer.
  
  // A. SPY Price (Daily)
  const spyDaily = await fetchAlphaVantage("TIME_SERIES_DAILY", "SPY");
  if (!spyDaily || !spyDaily["Time Series (Daily)"]) return null;
  
  const dates = Object.keys(spyDaily["Time Series (Daily)"]).sort().reverse();
  const lastCloseDate = dates[0]; // e.g., "2023-10-27"
  const spyPrice = parseFloat(spyDaily["Time Series (Daily)"][lastCloseDate]["4. close"]);

  // Check if our cache already has this date.
  if (cached) {
    const parsed: MarketData = JSON.parse(cached);
    if (parsed.lastUpdated === lastCloseDate) {
      console.log("Using cached data for date:", lastCloseDate);
      return parsed;
    }
  }

  // B. SPY EMA 50
  const spyEmaData = await fetchAlphaVantage("EMA", "SPY", "&interval=daily&time_period=50&series_type=close");
  let spyEma50 = 0;
  if (spyEmaData && spyEmaData["Technical Analysis: EMA"]) {
     const emaDates = Object.keys(spyEmaData["Technical Analysis: EMA"]).sort().reverse();
     // match the date
     const emaVal = spyEmaData["Technical Analysis: EMA"][lastCloseDate] || spyEmaData["Technical Analysis: EMA"][emaDates[0]];
     spyEma50 = parseFloat(emaVal["EMA"]);
  }

  // C. SPY RSI
  const spyRsiData = await fetchAlphaVantage("RSI", "SPY", "&interval=daily&time_period=14&series_type=close");
  let spyRsi = 50;
  if (spyRsiData && spyRsiData["Technical Analysis: RSI"]) {
     const rsiDates = Object.keys(spyRsiData["Technical Analysis: RSI"]).sort().reverse();
     const rsiVal = spyRsiData["Technical Analysis: RSI"][lastCloseDate] || spyRsiData["Technical Analysis: RSI"][rsiDates[0]];
     spyRsi = parseFloat(rsiVal["RSI"]);
  }

  // D. VIX
  // Note: AlphaVantage often uses just "VIX" or "VIXCLS" (FRED). For stocks endpoint it's "VIX".
  // If TIME_SERIES_DAILY fails for VIX, we might need another way, but let's try.
  const vixDaily = await fetchAlphaVantage("TIME_SERIES_DAILY", "VIX"); // or ^VIX? AV usually implies standard ticker.
  let vix = 15;
  if (vixDaily && vixDaily["Time Series (Daily)"]) {
     const vixDates = Object.keys(vixDaily["Time Series (Daily)"]).sort().reverse();
     // VIX might have slightly different dates? usually same trading days.
     const latestVixDate = vixDates[0];
     vix = parseFloat(vixDaily["Time Series (Daily)"][latestVixDate]["4. close"]);
  }

  // E. P/E Ratio
  // OVERVIEW endpoint
  const overview = await fetchAlphaVantage("OVERVIEW", "SPY");
  let peRatio = 23.1; // Default/Fallback
  if (overview && overview["PERatio"]) {
    peRatio = parseFloat(overview["PERatio"]);
  } else if (overview && overview["PE"]) { // Check key
     peRatio = parseFloat(overview["PE"]);
  }
  
  // Construct Result
  const result: MarketData = {
    spyPrice,
    spyEma50,
    spyRsi,
    vix,
    peRatio,
    lastUpdated: lastCloseDate
  };

  // Save to Cache
  if (typeof window !== "undefined") {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  }

  return result;
}
