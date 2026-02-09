import { Board } from '../types';

export interface PendingMove {
    fromColumnId: string;
    toColumnId: string;
    fromIndex: number;
    toIndex: number;
    previousBoardSnapshot: Board;
    clientMoveId: number;
}

export interface BoardState {
    board: Board;
    pendingMoves: Record<string, PendingMove>; // cardId -> PendingMove
    latestClientMoveIdByCard: Record<string, number>; // cardId -> last move ID
    toast: { message: string; visible: boolean } | null;
    boardLoadError: string | null;
    boardLoading: boolean;
}

export type BoardAction =
    | { type: 'SET_BOARD'; board: Board }
    | { type: 'SET_BOARD_LOADING'; loading: boolean }
    | { type: 'SET_BOARD_ERROR'; error: string | null }
    | { type: 'OPTIMISTIC_MOVE'; payload: { cardId: string; sourceColumnId: string; targetColumnId: string; fromIndex: number; toIndex: number; clientMoveId: number } }
    | { type: 'MOVE_CONFIRMED'; payload: { cardId: string; clientMoveId: number } }
    | { type: 'ROLLBACK_MOVE'; payload: { cardId: string; clientMoveId: number } }
    | { type: 'SHOW_TOAST'; message: string }
    | { type: 'HIDE_TOAST' };

export const initialState: BoardState = {
    board: { columns: [] },
    pendingMoves: {},
    latestClientMoveIdByCard: {},
    toast: null,
    boardLoadError: null,
    boardLoading: true,
};

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
    switch (action.type) {
        case 'SET_BOARD':
            return { ...state, board: action.board, boardLoadError: null, boardLoading: false };
        case 'SET_BOARD_LOADING':
            return { ...state, boardLoading: action.loading };
        case 'SET_BOARD_ERROR':
            return { ...state, boardLoadError: action.error, boardLoading: false };

        case 'OPTIMISTIC_MOVE': {
            const { cardId, sourceColumnId, targetColumnId, fromIndex, toIndex, clientMoveId } = action.payload;
            const newBoard = JSON.parse(JSON.stringify(state.board)) as Board;

            const sourceColumn = newBoard.columns.find(c => c.id === sourceColumnId);
            const targetColumn = newBoard.columns.find(c => c.id === targetColumnId);

            if (!sourceColumn || !targetColumn) return state;

            // Find the card to ensure it exists
            const currentFromIndex = sourceColumn.cards.findIndex(c => c.id === cardId);
            if (currentFromIndex === -1) return state;

            const [movedCard] = sourceColumn.cards.splice(currentFromIndex, 1);
            targetColumn.cards.splice(toIndex, 0, movedCard);

            return {
                ...state,
                board: newBoard,
                pendingMoves: {
                    ...state.pendingMoves,
                    [cardId]: {
                        fromColumnId: sourceColumnId,
                        toColumnId: targetColumnId,
                        fromIndex: currentFromIndex,
                        toIndex,
                        previousBoardSnapshot: state.board,
                        clientMoveId,
                    },
                },
                latestClientMoveIdByCard: {
                    ...state.latestClientMoveIdByCard,
                    [cardId]: clientMoveId,
                },
            };
        }

        case 'MOVE_CONFIRMED': {
            const { cardId, clientMoveId } = action.payload;
            if (state.latestClientMoveIdByCard[cardId] === clientMoveId) {
                const newPendingMoves = { ...state.pendingMoves };
                delete newPendingMoves[cardId];
                return { ...state, pendingMoves: newPendingMoves };
            }
            return state;
        }

        case 'ROLLBACK_MOVE': {
            const { cardId, clientMoveId } = action.payload;
            if (state.latestClientMoveIdByCard[cardId] === clientMoveId) {
                const pendingMove = state.pendingMoves[cardId];
                if (!pendingMove) return state;

                const newPendingMoves = { ...state.pendingMoves };
                delete newPendingMoves[cardId];

                return {
                    ...state,
                    board: pendingMove.previousBoardSnapshot,
                    pendingMoves: newPendingMoves,
                };
            }
            return state;
        }

        case 'SHOW_TOAST':
            return { ...state, toast: { message: action.message, visible: true } };

        case 'HIDE_TOAST':
            return { ...state, toast: null };

        default:
            return state;
    }
}
