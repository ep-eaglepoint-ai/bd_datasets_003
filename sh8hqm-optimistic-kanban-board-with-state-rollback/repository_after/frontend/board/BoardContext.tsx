import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { boardReducer, initialState, BoardState, BoardAction } from './boardReducer';
import { fetchBoard } from '../services/client';

interface BoardContextType {
    state: BoardState;
    dispatch: React.Dispatch<BoardAction>;
}

const BoardContext = createContext<BoardContextType | undefined>(undefined);

export const BoardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(boardReducer, initialState);

    useEffect(() => {
        dispatch({ type: 'SET_BOARD_LOADING', loading: true });
        fetchBoard()
            .then(board => {
                dispatch({ type: 'SET_BOARD', board });
            })
            .catch(err => {
                const message = err instanceof Error ? err.message : 'Could not load board';
                dispatch({
                    type: 'SET_BOARD_ERROR',
                    error: message + '. Make sure the backend is running: npm run backend (port 3001)',
                });
            });
    }, []);

    return (
        <BoardContext.Provider value={{ state, dispatch }}>
            {children}
        </BoardContext.Provider>
    );
};

export const useBoard = () => {
    const context = useContext(BoardContext);
    if (!context) {
        throw new Error('useBoard must be used within a BoardProvider');
    }
    return context;
};
