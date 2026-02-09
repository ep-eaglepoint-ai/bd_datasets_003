import React from 'react';

interface CardProps {
    id: string;
    title: string;
    columnId: string;
    index: number;
}

export const Card: React.FC<CardProps> = ({ id, title, columnId, index }) => {
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('cardId', id);
        e.dataTransfer.setData('fromColumnId', columnId);
        e.dataTransfer.setData('fromIndex', index.toString());
        e.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div
            id={`card-${id}`}
            className="card"
            draggable
            onDragStart={handleDragStart}
            style={{
                padding: '10px',
                margin: '5px',
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'move',
            }}
        >
            {title}
        </div>
    );
};
