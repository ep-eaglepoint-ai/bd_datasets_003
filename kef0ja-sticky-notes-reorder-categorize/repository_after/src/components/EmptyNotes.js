import React from 'react'
import { useStickyNotes } from '../context/StickyNotesContext';
import { PlusSvgIcon } from './SvgIcons';
import "./EmptyNotes.css"

const EmptyNotes = () => {
    const { notes, addNewNote, selectedCategory } = useStickyNotes();
    if (notes.length > 0) return null
    const getMessage = () => {
        if (selectedCategory === 'all') {
            return "No notes yet. Please add a new note by clicking the button below.";
        } else {
            return `No notes in this category. Try changing the filter or add a new note.`;
        }
    }

    return (
        <div className='empty-notes-container'>
            <img className="empty-notes-image" src="add_new_note.png" alt="empty notes" />
            <div className="empty-notes">{getMessage()}</div>
            <button className="add-note-button" onClick={addNewNote}>
                <PlusSvgIcon />
                Add new note
            </button>
        </div>
    )
}

export default EmptyNotes