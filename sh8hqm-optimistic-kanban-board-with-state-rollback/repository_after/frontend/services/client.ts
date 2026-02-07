import { Board, MoveRequest } from '../types';

// Use relative URL so Vite dev server proxies /api to the backend (no CORS issues)
const BASE_URL = '/api';
const FETCH_TIMEOUT_MS = 8000;

export const fetchBoard = async (): Promise<Board> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(`${BASE_URL}/board`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Failed to fetch board (${response.status})`);
        return response.json();
    } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof Error) {
            if (err.name === 'AbortError') throw new Error('Request timed out. Is the backend running on port 3001? (npm run backend)');
            throw err;
        }
        throw new Error('Could not load board');
    }
};

export const moveCardApi = async (moveRequest: MoveRequest): Promise<{ success: true; board: Board }> => {
    const response = await fetch(`${BASE_URL}/move`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(moveRequest),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to move card');
    }

    return response.json();
};
