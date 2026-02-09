import React from 'react';
import { useBoard } from '../board/BoardContext';

export const ToastContainer: React.FC = () => {
    const { state } = useBoard();

    if (!state.toast || !state.toast.visible) return null;

    return (
        <div
            id="toast"
            style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                backgroundColor: '#f44336',
                color: 'white',
                padding: '16px',
                borderRadius: '4px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                zIndex: 1000,
            }}
        >
            {state.toast.message}
        </div>
    );
};
