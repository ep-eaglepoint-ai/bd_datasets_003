import { Board } from '../shared/types';

let board: Board = {
    columns: [
        {
            id: 'col-1',
            title: 'To Do',
            cards: [
                { id: 'card-1', title: 'Task 1' },
                { id: 'card-2', title: 'Task 2' },
            ],
        },
        {
            id: 'col-2',
            title: 'In Progress',
            cards: [
                { id: 'card-3', title: 'Task 3' },
            ],
        },
        {
            id: 'col-3',
            title: 'Done',
            cards: [],
        },
    ],
};

export const getBoard = (): Board => board;

export const resetBoard = (initialBoard?: Board) => {
    if (initialBoard) {
        board = JSON.parse(JSON.stringify(initialBoard));
    } else {
        board = {
            columns: [
                {
                    id: 'col-1',
                    title: 'To Do',
                    cards: [
                        { id: 'card-1', title: 'Task 1' },
                        { id: 'card-2', title: 'Task 2' },
                    ],
                },
                {
                    id: 'col-2',
                    title: 'In Progress',
                    cards: [
                        { id: 'card-3', title: 'Task 3' },
                    ],
                },
                {
                    id: 'col-3',
                    title: 'Done',
                    cards: [],
                },
            ],
        };
    }
};

export const moveCard = (
    cardId: string,
    sourceColumnId: string,
    targetColumnId: string,
    targetIndex: number
) => {
    const sourceColumn = board.columns.find((c) => c.id === sourceColumnId);
    if (!sourceColumn) throw new Error('Source column not found');

    const targetColumn = board.columns.find((c) => c.id === targetColumnId);
    if (!targetColumn) throw new Error('Target column not found');

    const cardIndex = sourceColumn.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) throw new Error('Card not found in source column');

    const isSameColumn = sourceColumnId === targetColumnId;

    const maxValidIndex = isSameColumn ? targetColumn.cards.length - 1 : targetColumn.cards.length;

    if (targetIndex < 0 || targetIndex > maxValidIndex) {
        throw new Error('Invalid target index');
    }

    // Capture card, remove from source, and insert into target
    const [movedCard] = sourceColumn.cards.splice(cardIndex, 1);
    targetColumn.cards.splice(targetIndex, 0, movedCard);

    return board;
};
