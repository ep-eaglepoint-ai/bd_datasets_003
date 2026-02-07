import React from 'react';
import { Card } from './Card';
import { useMoveCard } from './useMoveCard';
import { Column as ColumnType } from '../types';

interface ColumnProps {
    column: ColumnType;
}

export const Column: React.FC<ColumnProps> = ({ column }) => {
    const { optimisticMove } = useMoveCard();

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const cardId = e.dataTransfer.getData('cardId');
        const fromColumnId = e.dataTransfer.getData('fromColumnId');
        const fromIndex = parseInt(e.dataTransfer.getData('fromIndex'), 10);

        const container = e.currentTarget as HTMLElement;
        const cardElements = Array.from(container.querySelectorAll('.card'));

        let toIndex = cardElements.length;

        for (let i = 0; i < cardElements.length; i++) {
            const rect = cardElements[i].getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if (e.clientY < midpoint) {
                toIndex = i;
                break;
            }
        }

        // Adjust index if moving within the same column
        let adjustedToIndex = toIndex;
        if (fromColumnId === column.id && fromIndex < toIndex) {
            adjustedToIndex = toIndex - 1;
        }

        optimisticMove({
            cardId,
            sourceColumnId: fromColumnId,
            targetColumnId: column.id,
            fromIndex,
            toIndex: adjustedToIndex,
        });
    };

    return (
        <div
            className="column"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
                width: '250px',
                minHeight: '400px',
                backgroundColor: '#f4f4f4',
                margin: '10px',
                borderRadius: '8px',
                padding: '10px',
            }}
        >
            <h3>{column.title}</h3>
            <div className="card-list">
                {column.cards.map((card, index) => (
                    <Card
                        key={card.id}
                        id={card.id}
                        title={card.title}
                        columnId={column.id}
                        index={index}
                    />
                ))}
            </div>
        </div>
    );
};
