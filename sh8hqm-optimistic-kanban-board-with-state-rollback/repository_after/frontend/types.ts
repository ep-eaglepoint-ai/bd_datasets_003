export interface Card {
    id: string;
    title: string;
}

export interface Column {
    id: string;
    title: string;
    cards: Card[];
}

export interface Board {
    columns: Column[];
}

export interface MoveRequest {
    cardId: string;
    sourceColumnId: string;
    targetColumnId: string;
    targetIndex: number;
    clientMoveId?: number;
}
