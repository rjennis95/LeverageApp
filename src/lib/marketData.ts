export interface HistoryPoint {
  date: string;
  value: number;
}

export interface MarketHistory {
  spy: HistoryPoint[];
  vix: HistoryPoint[];
  peRatio: number; // Still single point for now
  lastUpdated: string;
  isMock?: boolean;
}

const CACHE_KEY_HISTORY = "market_data_history_full";
const API_KEY = process.env.NEXT_PUBLIC_MARKET_DATA_KEY;

// Mock Data Generator for Fallback
function generateMockHistory(basePrice: number, days: number, volatility: number): HistoryPoint[] {
    const data: HistoryPoint[] = [];
    let currentPrice = basePrice;
    const now = new Date();
    
    // Generate dates going back in time
    for (let i = days; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        // Simple random walk
        const change = (Math.random() - 0.5) * volatility;
        currentPrice += change;
        
        // Skip weekends roughly (simplified)
        const day = date.getDay();
        if (day !== 0 && day !== 6) {
             data.push({
                date: date.toISOString().split("T")[0],
                value: currentPrice
             });
        }
    }
    return data;
}

export const MOCK_DATA: MarketHistory = {
    spy: generateMockHistory(440, 3650, 5), // 10 years of SPYish data
    vix: generateMockHistory(15, 3650, 1),  // 10 years of VIXish data
    peRatio: 23.1,
    lastUpdated: new Date().toISOString().split("T")[0],
    isMock: true
};

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
    try {
        const parsed: MarketHistory = JSON.parse(cached);
        const today = new Date().toISOString().split("T")[0];
        
        // Check if data is somewhat valid array
        if (parsed.spy && parsed.spy.length > 0) {
            if (parsed.lastUpdated === today) {
                console.log("Using cached history for today");
                return parsed;
            }
             // Use stale cache if available to prevent blank screens
            console.log("Using cached history (potentially stale)");
            return parsed;
        }
    } catch (e) {
        console.warn("Cache parse error, ignoring cache");
    }
  }
  
  // 2. Fetch SPY Full History
  // If API Key is missing, go straight to mock
  if (!API_KEY) {
      console.warn("No API Key, using Mock Data");
      return MOCK_DATA;
  }

  const spyData = await fetchAlphaVantage("TIME_SERIES_DAILY", "SPY", "&outputsize=full");
  const spyHistory = parseTimeSeries(spyData);
  
  // FAILSAFE: If API failed (limit reached, etc), and we have no cache -> USE MOCK
  if (spyHistory.length === 0) {
      console.warn("API Request Failed or Limit Reached. Using Fallback Mock Data.");
      return MOCK_DATA;
  }

  // 3. Fetch VIX Full History
  await new Promise(r => setTimeout(r, 1000)); // 1s delay
  const vixData = await fetchAlphaVantage("TIME_SERIES_DAILY", "VIX", "&outputsize=full");
  let vixHistory = parseTimeSeries(vixData);
  
  // If VIX fails but SPY succeeded, use Mock VIX or handle gracefully? 
  // Let's fallback VIX to Mock VIX if empty, but keep real SPY.
  if (vixHistory.length === 0) {
      vixHistory = MOCK_DATA.vix; // Fallback just for VIX
  }

  // 4. Fetch P/E (Overview)
  const overview = await fetchAlphaVantage("OVERVIEW", "SPY");
  let peRatio = 23.1;
  if (overview && (overview["PERatio"] || overview["PE"])) {
    peRatio = parseFloat(overview["PERatio"] || overview["PE"]);
  }

  const lastUpdated = spyHistory[spyHistory.length - 1].date;

  const result: MarketHistory = {
    spy: spyHistory,
    vix: vixHistory, 
    peRatio,
    lastUpdated,
    isMock: false
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
