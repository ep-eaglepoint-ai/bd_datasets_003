import React, { useRef, useState } from 'react'
import "./StickyNotesGrid.css"
import StickyNote from './StickyNote'
import { useStickyNotes } from '../context/StickyNotesContext'
import CategoryFilter from './CategoryFilter'

const StickyNotesGrid = () => {
    const { notes, updateNote, deleteNote, moveNote } = useStickyNotes();
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const gridRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const targetIndex = dragOverIndex;
        
        if (!isNaN(draggedIndex) && !isNaN(targetIndex) && draggedIndex !== targetIndex) {
            moveNote(draggedIndex, targetIndex);
        }
        
        setDragOverIndex(null);
        document.querySelectorAll('.drop-zone').forEach(el => {
            el.classList.remove('drop-zone-active');
        });
    };

    const handleDragEnter = (index) => {
        setDragOverIndex(index);
    };

    const handleDragLeave = () => {
        setTimeout(() => {
            if (document.querySelectorAll('.drop-zone-active').length === 0) {
                setDragOverIndex(null);
            }
        }, 50);
    };

    return (
        <>
            <CategoryFilter />
            <div 
                className="grid-container"
                ref={gridRef}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {notes.map((note, index) => (
                    <div
                        key={note.id}
                        className={`note-container ${dragOverIndex === index ? 'drop-zone' : ''}`}
                        onDragEnter={() => handleDragEnter(index)}
                        onDragLeave={handleDragLeave}
                    >
                        <StickyNote
                            index={index}
                            note={note}
                            onNoteChange={updateNote}
                            onDelete={deleteNote}
                        />
                    </div>
                ))}
            </div>
        </>
    )
}

export default StickyNotesGrid