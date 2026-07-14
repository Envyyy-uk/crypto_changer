import {
  CandlestickSeries,
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

interface Kline {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
type Interval = (typeof INTERVALS)[number];

export default function CandleChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [interval, setInterval] = useState<Interval>('1h');
  const [error, setError] = useState<string | null>(null);

  // Create the chart once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#8b93a7',
      },
      grid: {
        vertLines: { color: '#1c2230' },
        horzLines: { color: '#1c2230' },
      },
      timeScale: { borderColor: '#232936', timeVisible: true },
      rightPriceScale: { borderColor: '#232936' },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#0ecb81',
      downColor: '#f6465d',
      borderUpColor: '#0ecb81',
      borderDownColor: '#f6465d',
      wickUpColor: '#0ecb81',
      wickDownColor: '#f6465d',
    });

    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // (Re)load candles when symbol or interval changes.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .get<Kline[]>(`/market-data/klines/${symbol}?interval=${interval}&limit=500`)
      .then((klines) => {
        if (cancelled || !seriesRef.current) return;
        seriesRef.current.setData(
          klines.map((k) => ({
            time: k.time as UTCTimestamp,
            open: Number(k.open),
            high: Number(k.high),
            low: Number(k.low),
            close: Number(k.close),
          })),
        );
        chartRef.current?.timeScale().fitContent();
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  return (
    <div>
      <div className="side-tabs" style={{ maxWidth: 360 }}>
        {INTERVALS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={interval === candidate ? 'active buy-tab' : ''}
            style={interval === candidate ? { background: '#1c2230', borderColor: '#f0b90b', color: '#f0b90b' } : {}}
            onClick={() => setInterval(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      <div ref={containerRef} style={{ height: 380, width: '100%' }} />
    </div>
  );
}
