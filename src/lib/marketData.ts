export interface HistoryPoint {
  date: string;
  value: number;
}

export interface MarketHistory {
  spyDaily: HistoryPoint[];
  spyWeekly: HistoryPoint[];
  spyMonthly: HistoryPoint[];
  vixDaily: HistoryPoint[];
  breadth: HistoryPoint[]; // Proxy: RSP vs SMA20
  peRatio: number;
  lastUpdated: string;
  isMock?: boolean;
}

const CACHE_KEY_FMP = "market_data_fmp_cache_v2";
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 Hour
const API_KEY = process.env.NEXT_PUBLIC_FMP_KEY;

// Fallback for Vercel env variable transition
const LEGACY_API_KEY = process.env.NEXT_PUBLIC_MARKET_DATA_KEY;

// Check which key is available
function getApiKey() {
    return API_KEY || LEGACY_API_KEY;
}

async function fetchFMP(endpoint: string, params: string = "") {
  const key = getApiKey();
  if (!key) {
      console.warn("FMP API Key missing.");
      return null;
  }
  
  // Clean endpoint just in case
  const url = `https://financialmodelingprep.com/api/v3/${endpoint}?apikey=${key}${params}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data["Error Message"]) {
      console.warn(`FMP Error for ${endpoint}:`, data["Error Message"]);
      return null;
    }
    return data;
  } catch (err) {
    console.error(`Error fetching FMP ${endpoint}:`, err);
    return null;
  }
}

// Helper to clean FMP historical data
function parseFMPHistory(data: any): HistoryPoint[] {
  if (!data || !data.historical) return [];
  // FMP returns { date: "YYYY-MM-DD", close: 123.45, ... } sorted Newest -> Oldest usually
  return data.historical
    .map((item: any) => ({
      date: item.date,
      value: item.close,
    }))
    .sort((a: HistoryPoint, b: HistoryPoint) => a.date.localeCompare(b.date)); // Ensure Ascending
}

// Resampler: Daily -> Weekly (Friday/Last)
function resampleToWeekly(daily: HistoryPoint[]): HistoryPoint[] {
    const weeklyMap = new Map<string, HistoryPoint>();
    // Helper to get Year-Week
    const getWeek = (d: Date) => {
        const date = new Date(d.getTime());
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
        const week1 = new Date(date.getFullYear(), 0, 4);
        return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    };

    daily.forEach(p => {
        const d = new Date(p.date);
        const weekNum = getWeek(d);
        const key = `${d.getFullYear()}-W${weekNum}`;
        weeklyMap.set(key, p); // Overwrite -> keeps last day of week
    });
    
    return Array.from(weeklyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Resampler: Daily -> Monthly
function resampleToMonthly(daily: HistoryPoint[]): HistoryPoint[] {
    const monthlyMap = new Map<string, HistoryPoint>();
    daily.forEach(p => {
        const key = p.date.substring(0, 7); // YYYY-MM
        monthlyMap.set(key, p); // Overwrite -> keeps last day of month
    });
    return Array.from(monthlyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getMarketHistory(): Promise<MarketHistory | null> {
  const now = Date.now();
  console.log("Starting Market Data Fetch...");

  // 1. Check Cache
  if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY_FMP);
      if (cached) {
          try {
              const parsed = JSON.parse(cached);
              // Check Expiry
              if (now - parsed.timestamp < CACHE_DURATION_MS) {
                  if (parsed.data && parsed.data.spyDaily?.length) {
                      console.log("Using cached FMP data");
                      return parsed.data;
                  }
              }
          } catch(e) { console.warn("Cache parse error", e); }
      }
  }

  if (!getApiKey()) {
      console.error("No API Key available");
      return null;
  }

  // 2. Fetch Data
  
  // A. SPY History (Full Daily)
  const spyFull = await fetchFMP("historical-price-full/SPY");
  const spyDaily = parseFMPHistory(spyFull);
  
  if (!spyDaily.length) {
      console.error("SPY History fetch failed or empty");
      return null;
  }

  // B. VIX Quote
  // Encode symbol for VIX (^VIX)
  const vixSymbol = encodeURIComponent("^VIX");
  const vixQuote = await fetchFMP(`quote/${vixSymbol}`);
  
  let vixValue = 15;
  let vixDate = new Date().toISOString().split("T")[0];
  if (vixQuote && vixQuote.length > 0) {
      vixValue = vixQuote[0].price;
  } else {
      console.warn("VIX Quote failed or empty");
  }
  
  const vixFull = await fetchFMP(`historical-price-full/${vixSymbol}`);
  let vixDaily = parseFMPHistory(vixFull);
  
  if (vixDaily.length === 0) {
      console.warn("VIX History failed, using fallback single point");
      vixDaily = [{ date: vixDate, value: vixValue }];
  }

  // C. NTM P/E
  // 1. Current Price
  const spyQuote = await fetchFMP("quote/SPY");
  const currentPrice = spyQuote && spyQuote.length ? spyQuote[0].price : spyDaily[spyDaily.length-1].value;
  
  // 2. Analyst Estimates (Likely Premium)
  // Fallback Logic: Try estimates. If fail, use trailing P/E from quote as fallback proxy?
  // Or just 23.1 fallback.
  // FMP Free Tier might allow 'analyst-estimates' for some tickers? Likely not.
  // Safe Fallback: Use 'pe' from quote if available.
  
  let peRatio = 23.1;
  const estimates = await fetchFMP("analyst-estimates/SPY", "&period=annual&limit=1"); 
  
  if (estimates && estimates.length > 0) {
      const estimatedEarnings = estimates[0].estimatedEarningsAvg || estimates[0].estimatedEpsAvg || 1;
      peRatio = currentPrice / estimatedEarnings;
  } else {
      // Fallback: Check if quote has 'pe'
      if (spyQuote && spyQuote.length > 0 && spyQuote[0].pe) {
          console.log("Using Trailing P/E as fallback (Estimates endpoint failed)");
          peRatio = spyQuote[0].pe;
      } else {
          console.warn("P/E fetch failed completely, using default.");
      }
  }

  // D. Breadth Proxy (RSP)
  const rspFull = await fetchFMP("historical-price-full/RSP");
  const breadthProxy = parseFMPHistory(rspFull);

  // E. Resampling
  const spyWeekly = resampleToWeekly(spyDaily);
  const spyMonthly = resampleToMonthly(spyDaily);

  const result: MarketHistory = {
      spyDaily,
      spyWeekly,
      spyMonthly,
      vixDaily,
      breadth: breadthProxy,
      peRatio,
      lastUpdated: spyDaily[spyDaily.length - 1].date,
      isMock: false
  };

  if (typeof window !== "undefined") {
      const cacheObj = {
          timestamp: now,
          data: result
      };
      try {
        localStorage.setItem(CACHE_KEY_FMP, JSON.stringify(cacheObj));
      } catch (e) { console.error("Cache save failed", e); }
  }
  
  return result;
}

// --- Technical Indicators (Unchanged) ---

export function calculateEMA(data: HistoryPoint[], period: number): HistoryPoint[] {
    if (data.length === 0) return [];
    const k = 2 / (period + 1);
    
    if (data.length < period) return [];
    
    let sum = 0;
    for(let i=0; i<period; i++) sum += data[i].value;
    let ema = sum / period;
    
    const result: HistoryPoint[] = [{ date: data[period-1].date, value: ema }];
    
    for (let i = period; i < data.length; i++) {
        ema = (data[i].value - ema) * k + ema;
        result.push({ date: data[i].date, value: ema });
    }
    return result;
}

export function calculateRSI(data: HistoryPoint[], period: number = 14): HistoryPoint[] {
    if (data.length < period + 1) return [];
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
        const diff = data[i].value - data[i - 1].value;
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    const result: HistoryPoint[] = [];
    
    let rs = avgGain / avgLoss;
    let rsi = 100 - (100 / (1 + rs));
    result.push({ date: data[period].date, value: rsi });
    
    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i].value - data[i - 1].value;
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        
        if (avgLoss === 0) {
            rsi = 100;
        } else {
            rs = avgGain / avgLoss;
            rsi = 100 - (100 / (1 + rs));
        }
        result.push({ date: data[i].date, value: rsi });
    }
    return result;
}

export function calculateSMA(data: HistoryPoint[], period: number): HistoryPoint[] {
    if (data.length < period) return [];
    const result: HistoryPoint[] = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) sum += data[i - j].value;
        result.push({ date: data[i].date, value: sum / period });
    }
    return result;
}
