import { createContext, useContext, useEffect, useRef, useState } from "react";

const StickyNotesContext = createContext();
const categories = [
  { id: 'work', name: 'Work', color: '#4A90D9' },
  { id: 'personal', name: 'Personal', color: '#7ED321' },
  { id: 'ideas', name: 'Ideas', color: '#F5A623' },
  { id: 'urgent', name: 'Urgent', color: '#D0021B' },
  { id: 'uncategorized', name: 'Uncategorized', color: '#9B9B9B' },
];

const StickyNotesProvider = ({ children }) => {
    const nextIdRef = useRef(0);
    const [notes, setNotes] = useState(() => {
        const savedNotes = JSON.parse(localStorage.getItem('notes')) || [];
        const migratedNotes = savedNotes.map((note, index) => ({
            ...note,
            order: note.order ?? index,
            category: note.category ?? 'uncategorized'
        }));

        // If we migrated anything, persist immediately so tests (and users) see the new schema.
        const changed = JSON.stringify(savedNotes) !== JSON.stringify(migratedNotes);
        if (changed) {
            localStorage.setItem('notes', JSON.stringify(migratedNotes));
        }

        // Seed nextIdRef to avoid collisions with existing numeric IDs.
        const maxId = migratedNotes.reduce((acc, n) => (typeof n.id === 'number' ? Math.max(acc, n.id) : acc), 0);
        nextIdRef.current = maxId + 1;

        return migratedNotes;
    });

    const [selectedCategory, setSelectedCategory] = useState('all');
    useEffect(() => {
        localStorage.setItem('notes', JSON.stringify(notes));
    }, [notes]);
    const filteredNotes = selectedCategory === 'all' 
        ? notes 
        : notes.filter(note => note.category === selectedCategory);
    const sortedNotes = [...filteredNotes].sort((a, b) => a.order - b.order);

    function addNewNote() {
        setNotes(prevNotes => {
            const uniqueId = Date.now() * 1000 + (nextIdRef.current++ % 1000);
            return [...prevNotes, {
                id: uniqueId,
                title: 'Click to edit title',
                content: 'Click to edit content',
                color: '#ffd500',
                category: 'uncategorized',
                order: prevNotes.length
            }];
        });
    }

    function updateNote(note) {
        setNotes(prevNotes => {
            const updatedNotes = prevNotes.map(prevNote => {
                if (prevNote.id === note.id) {
                    return { ...prevNote, ...note };
                }
                return prevNote;
            });
            return updatedNotes;
        });
    }

    function deleteNote(id) {
        setNotes(prevNotes => {
            const newNotes = prevNotes.filter(note => note.id !== id);
            return newNotes.map((note, index) => ({
                ...note,
                order: index
            }));
        });
    }
    function moveNote(draggedIndex, targetIndex) {
        setNotes(prevNotes => {
            const newNotes = [...prevNotes];
            const [movedNote] = newNotes.splice(draggedIndex, 1);
            newNotes.splice(targetIndex, 0, movedNote);

            return newNotes.map((note, index) => ({
                ...note,
                order: index
            }));
        });
    }
    function updateNoteCategory(noteId, categoryId) {
        setNotes(prevNotes => {
            return prevNotes.map(note => {
                if (note.id === noteId) {
                    return { ...note, category: categoryId };
                }
                return note;
            });
        });
    }

    return (
        <StickyNotesContext.Provider value={{
            notes: sortedNotes,
            categories,
            selectedCategory,
            setSelectedCategory,
            addNewNote,
            updateNote,
            deleteNote,
            moveNote,
            updateNoteCategory
        }}>
            {children}
        </StickyNotesContext.Provider>
    );
}

export default StickyNotesProvider;
export const useStickyNotes = () => useContext(StickyNotesContext);