'use client';

import { useRef, useCallback, useEffect } from 'react';
import type { WorkerMessage } from '../workers/calculations.worker';

export interface WorkerResult<T> {
  success: boolean;
  result?: T;
  error?: string;
}

export function useCalculationsWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingCallbacks = useRef<Map<string, (result: WorkerResult<unknown>) => void>>(new Map());
  
  useEffect(() => {
    // Create worker only in browser environment
    if (typeof window !== 'undefined') {
      workerRef.current = new Worker(
        new URL('../workers/calculations.worker.ts', import.meta.url)
      );
      
      workerRef.current.onmessage = (event: MessageEvent<WorkerResult<unknown>>) => {
        // For simplicity, we handle one request at a time
        const callbacks = Array.from(pendingCallbacks.current.values());
        if (callbacks.length > 0) {
          const callback = callbacks[0];
          pendingCallbacks.current.clear();
          callback(event.data);
        }
      };
      
      workerRef.current.onerror = (error) => {
        console.error('Worker error:', error);
        const callbacks = Array.from(pendingCallbacks.current.values());
        callbacks.forEach(cb => cb({ success: false, error: error.message }));
        pendingCallbacks.current.clear();
      };
    }
    
    return () => {
      workerRef.current?.terminate();
    };
  }, []);
  
  const postMessage = useCallback(<T>(message: WorkerMessage): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }
      
      const id = Math.random().toString(36).substring(7);
      pendingCallbacks.current.set(id, (result: WorkerResult<unknown>) => {
        if (result.success) {
          resolve(result.result as T);
        } else {
          reject(new Error(result.error));
        }
      });
      
      workerRef.current.postMessage(message);
    });
  }, []);
  
  return { postMessage };
}
