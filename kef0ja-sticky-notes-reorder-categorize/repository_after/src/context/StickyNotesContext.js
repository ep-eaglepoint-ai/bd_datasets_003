import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

const StickyNotesContext = createContext();
const categories = [
  { id: 'work', name: 'Work', color: '#4A90D9' },
  { id: 'personal', name: 'Personal', color: '#7ED321' },
  { id: 'ideas', name: 'Ideas', color: '#F5A623' },
  { id: 'urgent', name: 'Urgent', color: '#D0021B' },
  { id: 'uncategorized', name: 'Uncategorized', color: '#9B9B9B' },
];

function normalizeNotes(savedNotes) {
    const base = Array.isArray(savedNotes) ? savedNotes : [];
    const migrated = base.map((note, index) => ({
        ...note,
        order: note?.order ?? index,
        category: note?.category ?? 'uncategorized'
    }));

    const sorted = [...migrated].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return sorted.map((note, index) => ({
        ...note,
        order: index
    }));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

const StickyNotesProvider = ({ children }) => {
    const nextIdRef = useRef(0);
    const [notes, setNotes] = useState(() => {
        const savedNotes = JSON.parse(localStorage.getItem('notes')) || [];
        const normalized = normalizeNotes(savedNotes);
        const changed = JSON.stringify(savedNotes) !== JSON.stringify(normalized);
        if (changed) {
            localStorage.setItem('notes', JSON.stringify(normalized));
        }

        const maxId = normalized.reduce((acc, n) => (typeof n.id === 'number' ? Math.max(acc, n.id) : acc), 0);
        nextIdRef.current = maxId + 1;

        return normalized;
    });

    const [selectedCategory, setSelectedCategory] = useState('all');
    useEffect(() => {
        localStorage.setItem('notes', JSON.stringify(notes));
    }, [notes]);

    const sortedNotes = useMemo(() => {
        const visible = selectedCategory === 'all'
            ? notes
            : notes.filter(note => note.category === selectedCategory);
        return [...visible].sort((a, b) => a.order - b.order);
    }, [notes, selectedCategory]);

    function addNewNote() {
        setNotes(prevNotes => {
            const uniqueId = Date.now() * 1000 + (nextIdRef.current++ % 1000);
            const normalized = normalizeNotes(prevNotes);
            return [...normalized, {
                id: uniqueId,
                title: 'Click to edit title',
                content: 'Click to edit content',
                color: '#ffd500',
                category: 'uncategorized',
                order: normalized.length
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
            const normalized = normalizeNotes(prevNotes);
            const newNotes = normalized.filter(note => note.id !== id);
            return newNotes.map((note, index) => ({ ...note, order: index }));
        });
    }

    function moveNote(fromIndex, toIndex) {
        setNotes(prevNotes => {
            const normalized = normalizeNotes(prevNotes);
            const visible = selectedCategory === 'all'
                ? normalized
                : normalized.filter(n => n.category === selectedCategory);

            if (fromIndex === toIndex) return normalized;
            if (fromIndex < 0 || fromIndex >= visible.length) return normalized;

            const movedId = visible[fromIndex].id;
            const movedNote = normalized.find(n => n.id === movedId);
            if (!movedNote) return normalized;

            const withoutMoved = normalized.filter(n => n.id !== movedId);
            const visibleWithout = selectedCategory === 'all'
                ? withoutMoved
                : withoutMoved.filter(n => n.category === selectedCategory);

            const insertionIndex = clamp(toIndex, 0, visibleWithout.length);

            const insertBeforeId = visibleWithout[insertionIndex]?.id;
            const insertAt = insertBeforeId
                ? withoutMoved.findIndex(n => n.id === insertBeforeId)
                : withoutMoved.length;

            if (insertAt < 0) return normalized;

            const next = [...withoutMoved];
            next.splice(insertAt, 0, movedNote);
            return next.map((note, index) => ({ ...note, order: index }));
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