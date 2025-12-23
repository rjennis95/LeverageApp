export interface HistoryPoint {
  date: string;
  value: number;
}

export interface MarketHistory {
  spy: HistoryPoint[];
  vix: HistoryPoint[];
  peRatio: number; // Still single point for now
  lastUpdated: string;
}

const CACHE_KEY_HISTORY = "market_data_history_full";
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

function parseTimeSeries(data: any): HistoryPoint[] {
  if (!data || !data["Time Series (Daily)"]) return [];
  const series = data["Time Series (Daily)"];
  return Object.keys(series)
    .sort() // Sort by date ascending
    .map((date) => ({
      date,
      value: parseFloat(series[date]["4. close"]),
    }));
}

export async function getMarketHistory(): Promise<MarketHistory | null> {
  // 1. Check Cache
  const cached = typeof window !== "undefined" ? localStorage.getItem(CACHE_KEY_HISTORY) : null;
  if (cached) {
    const parsed: MarketHistory = JSON.parse(cached);
    // Simple cache invalidation: check if lastUpdated is today (or yesterday if weekend).
    // For now, let's just use the cache if it exists to save API calls during development.
    // In production, you'd check dates.
    const today = new Date().toISOString().split("T")[0];
    if (parsed.lastUpdated === today) {
       console.log("Using cached history for today");
       return parsed;
    }
    // If it's old, we might want to refresh. But to be safe with limits, let's reuse if < 12h old.
    // Implementation detail: For this demo, let's return cached if available to avoid "Note" errors.
    console.log("Using cached history (potentially stale)");
    return parsed;
  }
  
  // 2. Fetch SPY Full History
  const spyData = await fetchAlphaVantage("TIME_SERIES_DAILY", "SPY", "&outputsize=full");
  const spyHistory = parseTimeSeries(spyData);
  
  if (spyHistory.length === 0) return null;

  // 3. Fetch VIX Full History
  // Note: We do this sequentially to be nice to the API rate limiter
  await new Promise(r => setTimeout(r, 1000)); // 1s delay
  const vixData = await fetchAlphaVantage("TIME_SERIES_DAILY", "VIX", "&outputsize=full");
  const vixHistory = parseTimeSeries(vixData);

  // 4. Fetch P/E (Overview)
  const overview = await fetchAlphaVantage("OVERVIEW", "SPY");
  let peRatio = 23.1;
  if (overview && (overview["PERatio"] || overview["PE"])) {
    peRatio = parseFloat(overview["PERatio"] || overview["PE"]);
  }

  const lastUpdated = spyHistory[spyHistory.length - 1].date;

  const result: MarketHistory = {
    spy: spyHistory,
    vix: vixHistory.length > 0 ? vixHistory : [], 
    peRatio,
    lastUpdated
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(CACHE_KEY_HISTORY, JSON.stringify(result));
    } catch (e) {
      console.error("Failed to save history to localStorage (quota exceeded?)", e);
    }
  }

  return result;
}

// --- Technical Indicator Helpers ---

export function calculateEMA(data: HistoryPoint[], period: number): HistoryPoint[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  let ema = data[0].value;
  const result: HistoryPoint[] = [{ date: data[0].date, value: ema }];
  
  for (let i = 1; i < data.length; i++) {
    ema = data[i].value * k + ema * (1 - k);
    result.push({ date: data[i].date, value: ema });
  }
  return result;
}

export function calculateRSI(data: HistoryPoint[], period: number = 14): HistoryPoint[] {
  if (data.length < period + 1) return [];
  
  let gains = 0;
  let losses = 0;
  
  // First average gain/loss
  for (let i = 1; i <= period; i++) {
    const diff = data[i].value - data[i - 1].value;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  const result: HistoryPoint[] = [];
  
  // Initial RSI
  let rs = avgGain / avgLoss;
  let rsi = 100 - (100 / (1 + rs));
  result.push({ date: data[period].date, value: rsi });
  
  // Subsequent RSI
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].value - data[i - 1].value;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    rs = avgGain / avgLoss;
    rsi = 100 - (100 / (1 + rs));
    result.push({ date: data[i].date, value: rsi });
  }
  
  return result;
}

export function calculateSMA(data: HistoryPoint[], period: number): HistoryPoint[] {
  if (data.length < period) return [];
  const result: HistoryPoint[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].value;
    }
    result.push({ date: data[i].date, value: sum / period });
  }
  return result;
}
