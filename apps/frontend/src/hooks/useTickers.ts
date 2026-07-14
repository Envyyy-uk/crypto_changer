import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { Ticker } from '../api/types';

/**
 * Live tickers over the exchange's own WebSocket, with REST fallback while
 * the socket is connecting and automatic reconnection when it drops.
 */
export function useTickers(): Record<string, Ticker> {
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | undefined;

    api
      .get<Ticker[]>('/market-data/tickers')
      .then((list) => {
        if (!disposed) setTickers(Object.fromEntries(list.map((t) => [t.symbol, t])));
      })
      .catch(() => undefined);

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'tickers') {
            setTickers(Object.fromEntries((message.data as Ticker[]).map((t) => [t.symbol, t])));
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        if (!disposed) reconnectTimer = window.setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  return tickers;
}

export function formatPrice(value: string | undefined): string {
  if (!value) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
