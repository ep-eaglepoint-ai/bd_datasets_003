import { useEffect, useRef, useCallback, useState } from 'react';
import { storage } from './storage';
import { WebSocketMessage } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:5000/ws';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
    onMessage?: (message: WebSocketMessage) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event) => void;
    autoReconnect?: boolean;
    reconnectInterval?: number;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
    const {
        onMessage,
        onOpen,
        onClose,
        onError,
        autoReconnect = true,
        reconnectInterval = 5000,
    } = options;

    const [status, setStatus] = useState<WebSocketStatus>('disconnected');
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

    const connect = useCallback(() => {
        const accessToken = storage.getAccessToken();

        if (!accessToken) {
            setStatus('disconnected');
            return;
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        setStatus('connecting');

        try {
            wsRef.current = new WebSocket(`${WS_URL}?token=${accessToken}`);

            wsRef.current.onopen = () => {
                setStatus('connected');
                onOpen?.();
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data) as WebSocketMessage;
                    onMessage?.(message);
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };

            wsRef.current.onclose = () => {
                setStatus('disconnected');
                onClose?.();

                if (autoReconnect) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect();
                    }, reconnectInterval);
                }
            };

            wsRef.current.onerror = (error) => {
                setStatus('error');
                onError?.(error);
            };
        } catch (error) {
            setStatus('error');
            console.error('WebSocket connection error:', error);
        }
    }, [onMessage, onOpen, onClose, onError, autoReconnect, reconnectInterval]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        setStatus('disconnected');
    }, []);

    const send = useCallback((message: Record<string, unknown>) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        }
    }, []);

    useEffect(() => {
        connect();

        return () => {
            disconnect();
        };
    }, [connect, disconnect]);

    return {
        status,
        connect,
        disconnect,
        send,
        isConnected: status === 'connected',
    };
};
