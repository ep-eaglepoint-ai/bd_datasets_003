import React from 'react';
import { useBoard } from './BoardContext';
import { Column } from './Column';

export const KanbanBoard: React.FC = () => {
    const { state } = useBoard();

    if (state.boardLoading) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                Loading board…
            </div>
        );
    }

    if (state.boardLoadError) {
        return (
            <div
                style={{
                    padding: '20px',
                    margin: '20px',
                    backgroundColor: '#fff3cd',
                    border: '1px solid #ffc107',
                    borderRadius: '8px',
                }}
            >
                <strong>Board unavailable</strong>
                <p style={{ margin: '8px 0 0' }}>{state.boardLoadError}</p>
            </div>
        );
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                padding: '20px',
                overflowX: 'auto',
            }}
        >
            {state.board.columns.map(column => (
                <Column key={column.id} column={column} />
            ))}
        </div>
    );
};
