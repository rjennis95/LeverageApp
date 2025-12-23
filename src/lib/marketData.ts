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

const CACHE_KEY_FMP = "market_data_fmp_cache";
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
  if (!key) return null;
  
  const url = `https://financialmodelingprep.com/api/v3/${endpoint}?apikey=${key}${params}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data["Error Message"]) {
      console.warn(`FMP Error for ${endpoint}:`, data);
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
    const weekly: HistoryPoint[] = [];
    if (!daily.length) return [];
    
    // Simple logic: Take the last available day of each ISO week?
    // Or just filter.
    // Let's iterate and pick Fridays or last day if gap.
    // Efficient way: Group by ISO Week string?
    // Let's stick to simple: iterate daily, keep track of current week.
    // Actually, FMP often has sparse data on weekends.
    // Let's look for day of week = 5 (Friday). If not present, maybe Thurs.
    // To be robust: Group by Year-Week.
    
    // Helper to get Year-Week
    const getWeek = (d: Date) => {
        const date = new Date(d.getTime());
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
        const week1 = new Date(date.getFullYear(), 0, 4);
        return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    };

    // This is getting complex. 
    // Simpler: Just take every 5th point? No, holidays.
    // Simpler: Use FMP's daily data and assume it's good enough to represent "Weekly" charts if we smooth it?
    // NO, user wants Weekly candles for EMA logic.
    // Let's try explicit Last-Day-Of-Week resampling.
    
    const weeklyMap = new Map<string, HistoryPoint>();
    daily.forEach(p => {
        const d = new Date(p.date);
        // Key: YYYY-Www
        const weekNum = getWeek(d);
        const key = `${d.getFullYear()}-W${weekNum}`;
        // Always overwrite, so we end up with the latest date for that week (Friday/Close)
        weeklyMap.set(key, p);
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
          } catch(e) {}
      }
  }

  if (!getApiKey()) return null;

  // 2. Fetch Data
  
  // A. SPY History (Full Daily) - used for Daily, Weekly, Monthly calc
  const spyFull = await fetchFMP("historical-price-full/SPY");
  const spyDaily = parseFMPHistory(spyFull);
  
  if (!spyDaily.length) return null;

  // B. VIX Quote
  const vixQuote = await fetchFMP("quote/^VIX");
  // FMP Quote returns array [{ price: ... }]
  let vixValue = 15;
  let vixDate = new Date().toISOString().split("T")[0];
  if (vixQuote && vixQuote.length > 0) {
      vixValue = vixQuote[0].price;
      // VIX historical needed for chart? 
      // User says "VIX (Column 2, Row 3): Fetch from /quote/^VIX". 
      // But the chart is a line chart. A single quote isn't enough for a 3Y chart.
      // Instructions say "Metric-Specific Endpoints... VIX... Fetch from quote".
      // But the DASHBOARD has a chart. 
      // I will infer I should ALSO fetch VIX history for the chart, or just use the quote for the *value* and maybe history for chart?
      // "Trend Charts (All Row 1s)" -> SPY.
      // "VIX (Column 2, Row 3)" -> Quote.
      // If I only fetch quote, the chart will be flat or empty.
      // I will fetch VIX history too for the chart sake, using historical-price-full/^VIX if possible.
  }
  
  const vixFull = await fetchFMP("historical-price-full/^VIX");
  let vixDaily = parseFMPHistory(vixFull);
  // Ensure the latest quote is appended if history is lagging?
  // FMP history is usually up to yesterday. Quote is live.
  // We can merge them if dates differ.
  if (vixDaily.length > 0) {
      const lastHist = vixDaily[vixDaily.length - 1];
      if (lastHist.date !== vixDate) {
          // vixDaily.push({ date: vixDate, value: vixValue }); // Optional: add live point
      }
  } else {
      // If history fails, create a single point array so chart doesn't crash?
      vixDaily = [{ date: vixDate, value: vixValue }];
  }

  // C. NTM P/E
  // 1. Current Price
  const spyQuote = await fetchFMP("quote/SPY");
  const currentPrice = spyQuote && spyQuote.length ? spyQuote[0].price : spyDaily[spyDaily.length-1].value;
  
  // 2. Analyst Estimates
  const estimates = await fetchFMP("analyst-estimates/SPY", "&period=annual&limit=1"); // limit 1 might give just one year?
  // We need "Next" NTM. The array usually sorts by date. 
  // We look for the first future entry? Or just first item?
  // FMP estimates usually returns sorted by year descending or ascending? 
  // Docs say "analyst-estimates". 
  // Let's assume the first entry in the array is the most relevant forward estimate or check dates.
  // Actually, usually it returns a list of years. We want the one matching "Next 12 Months".
  // Simplified: Take the estimate for the current year or next year?
  // Instruction: "Use the first item in the estimates array".
  let estimatedEarnings = 1;
  if (estimates && estimates.length > 0) {
      estimatedEarnings = estimates[0].estimatedEarningsAvg || estimates[0].estimatedEpsAvg || 1;
  }
  
  const peRatio = estimatedEarnings !== 0 ? currentPrice / estimatedEarnings : 23.1;

  // D. Breadth Proxy (RSP) - Kept from previous logic for Column 1 Row 3 chart?
  // User didn't specify changing this, but we moved to FMP.
  // We should fetch RSP history from FMP too to keep it working.
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
