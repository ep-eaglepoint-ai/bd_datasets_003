import { useCallback } from 'react';
import { useBoard } from './BoardContext';
import { moveCardApi } from '../services/client';

const timeouts: Record<string, any> = {};
const moveCounters: Record<string, number> = {};

export const useMoveCard = () => {
    const { dispatch } = useBoard();

    const optimisticMove = useCallback(
        ({
            cardId,
            sourceColumnId,
            targetColumnId,
            fromIndex,
            toIndex,
        }: {
            cardId: string;
            sourceColumnId: string;
            targetColumnId: string;
            fromIndex: number;
            toIndex: number;
        }) => {
            // Increment clientMoveId for this card
            const clientMoveId = (moveCounters[cardId] || 0) + 1;
            moveCounters[cardId] = clientMoveId;

            // 1. Optimistic update
            dispatch({
                type: 'OPTIMISTIC_MOVE',
                payload: { cardId, sourceColumnId, targetColumnId, fromIndex, toIndex, clientMoveId },
            });

            // 2. Debounce
            if (timeouts[cardId]) {
                clearTimeout(timeouts[cardId]);
            }

            timeouts[cardId] = setTimeout(async () => {
                try {
                    // We always send the latest target info with the latest clientMoveId
                    await moveCardApi({
                        cardId,
                        sourceColumnId,
                        targetColumnId,
                        targetIndex: toIndex,
                        clientMoveId,
                    });

                    dispatch({ type: 'MOVE_CONFIRMED', payload: { cardId, clientMoveId } });
                } catch (error: any) {
                    dispatch({ type: 'ROLLBACK_MOVE', payload: { cardId, clientMoveId } });

                    if (moveCounters[cardId] === clientMoveId) {
                        dispatch({ type: 'SHOW_TOAST', message: 'Failed to move card. Changes reverted.' });

                        setTimeout(() => {
                            if (moveCounters[cardId] === clientMoveId) {
                                dispatch({ type: 'HIDE_TOAST' });
                            }
                        }, 3000);
                    }
                }
            }, 500);
        },
        [dispatch]
    );

    return { optimisticMove };
};
