import { useState, useEffect, useCallback, useRef } from 'react';

export const useWebSocket = (pollId: string | null) => {
  const [results, setResults] = useState<Record<string, number>>({});
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!pollId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // For local development, assuming backend on localhost:8000
    const host = 'localhost:8000'; 
    const socketUrl = `${protocol}//${host}/ws/polls/${pollId}`;

    ws.current = new WebSocket(socketUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'initial_state' || data.type === 'results_update') {
        setResults(data.results);
      }
    };

    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      // Robust reconnection logic
      reconnectTimeout.current = window.setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.current?.close();
    };
  }, [pollId]);

  useEffect(() => {
    connect();
    return () => {
      if (ws.current) {
        ws.current.onclose = null; // Prevent reconnect on unmount
        ws.current.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connect]);

  return { results, isConnected };
};
