import React from 'react';
import { BoardProvider } from './board/BoardContext';
import { KanbanBoard } from './board/KanbanBoard';
import { ToastContainer } from './components/ToastContainer';

export const App: React.FC = () => {
    return (
        <BoardProvider>
            <div className="app">
                <header style={{ padding: '20px', textAlign: 'center' }}>
                    <h1>Optimistic Kanban</h1>
                </header>
                <main>
                    <KanbanBoard />
                </main>
                <ToastContainer />
            </div>
        </BoardProvider>
    );
};

export default App;
