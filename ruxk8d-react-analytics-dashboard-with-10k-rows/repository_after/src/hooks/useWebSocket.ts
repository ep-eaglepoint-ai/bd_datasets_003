
import { useEffect, useRef } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { Transaction } from '../types';

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Requirement 5: Use store.getState() pattern to access actions without putting them in dependency array
      const { addTransaction, updateTransaction } = useDashboardStore.getState();

      if (data.type === 'new_transaction') {
        addTransaction(data.transaction);
      } else if (data.type === 'update_transaction') {
        updateTransaction(data.id, data.updates);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    // Requirement 8: Cleanup function closes WebSocket
    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [url]); // Only reconnect if URL changes

  return wsRef.current;
}
