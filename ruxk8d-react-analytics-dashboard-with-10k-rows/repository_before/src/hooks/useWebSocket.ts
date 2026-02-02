import { useEffect, useRef } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import { Transaction } from '../types';

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const { addTransaction, updateTransaction } = useDashboardStore();
  
  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'new_transaction') {
        addTransaction(data.transaction);
      } else if (data.type === 'update_transaction') {
        updateTransaction(data.id, data.updates);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    return () => {
      ws.close();
    };
  }, [url, addTransaction, updateTransaction]);
  
  return wsRef.current;
}
