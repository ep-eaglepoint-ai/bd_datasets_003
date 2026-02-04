'use client';

import { useState } from 'react';
import initialData from '../data.json';

function Card({ card, onDragStart }) {
    const priorityClass = `priority-badge priority-${card.priority}`;
    const initials = card.assignee.split(' ').map(n => n[0]).join('').toUpperCase();

    return (
        <div
            className="card"
            data-testid={`card-${card.id}`}
            draggable
            onDragStart={(e) => onDragStart(e, card.id)}
        >
            <h3 className="card-title">{card.title}</h3>
            <p className="card-description">{card.description}</p>
            <div className="card-meta">
                <span className={priorityClass}>{card.priority}</span>
                <div className="assignee">
                    <div className="assignee-avatar">{initials}</div>
                    <span>{card.assignee}</span>
                </div>
                <div className="due-date">
                    <span className="due-date-icon">📅</span>
                    <span>{card.dueDate}</span>
                </div>
            </div>
        </div>
    );
}

function Column({ column, onDragStart, onDragOver, onDrop }) {
    return (
        <div
            className="column"
            data-testid={`column-${column.id}`}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, column.id)}
        >
            <div className="column-header">
                <h2 className="column-title">{column.title}</h2>
                <span className="card-count">{column.cards.length}</span>
            </div>
            <div className="cards-container">
                {column.cards.map(card => (
                    <Card key={card.id} card={card} onDragStart={onDragStart} />
                ))}
            </div>
        </div>
    );
}

export default function Home() {
    const [board, setBoard] = useState(initialData.boards[0]);
    const [draggedCardId, setDraggedCardId] = useState(null);

    const handleDragStart = (e, cardId) => {
        setDraggedCardId(cardId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, targetColumnId) => {
        e.preventDefault();

        if (!draggedCardId) return;

        setBoard(prevBoard => {
            const newColumns = prevBoard.columns.map(col => ({
                ...col,
                cards: [...col.cards]
            }));

            let draggedCard = null;
            let sourceColumnIndex = -1;

            // Find and remove the dragged card from its source column
            for (let i = 0; i < newColumns.length; i++) {
                const cardIndex = newColumns[i].cards.findIndex(c => c.id === draggedCardId);
                if (cardIndex !== -1) {
                    draggedCard = newColumns[i].cards[cardIndex];
                    newColumns[i].cards.splice(cardIndex, 1);
                    sourceColumnIndex = i;
                    break;
                }
            }

            // Add the card to the target column
            if (draggedCard) {
                const targetColumn = newColumns.find(col => col.id === targetColumnId);
                if (targetColumn) {
                    targetColumn.cards.push(draggedCard);
                }
            }

            return { ...prevBoard, columns: newColumns };
        });

        setDraggedCardId(null);
    };

    return (
        <main className="app-container">
            <header className="app-header">
                <h1 className="app-title">{board.name}</h1>
                <p className="app-subtitle">Drag cards between columns to update their status</p>
            </header>

            <div className="board-container" data-testid="kanban-board">
                {board.columns.map(column => (
                    <Column
                        key={column.id}
                        column={column}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    />
                ))}
            </div>
        </main>
    );
}
