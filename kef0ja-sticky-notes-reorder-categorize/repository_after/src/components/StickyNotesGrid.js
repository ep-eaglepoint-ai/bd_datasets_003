import React, { useEffect, useMemo, useRef, useState } from 'react'
import "./StickyNotesGrid.css"
import StickyNote from './StickyNote'
import { useStickyNotes } from '../context/StickyNotesContext'
import CategoryFilter from './CategoryFilter'

const StickyNotesGrid = () => {
    const { notes, updateNote, deleteNote, moveNote } = useStickyNotes();
    const [dragInsertIndex, setDragInsertIndex] = useState(null);
    const [draggingIndex, setDraggingIndex] = useState(null);
    const [isTouchDragging, setIsTouchDragging] = useState(false);
    const gridRef = useRef(null);
    const touchDragRef = useRef({
        pointerId: null,
        fromIndex: null,
        ghostEl: null,
        offsetX: 0,
        offsetY: 0,
    });

    const noteCount = notes.length;
    const dropZones = useMemo(() => Array.from({ length: noteCount + 1 }, (_, i) => i), [noteCount]);

    const clearDragState = () => {
        setDragInsertIndex(null);
        setDraggingIndex(null);
        setIsTouchDragging(false);
        const { ghostEl } = touchDragRef.current;
        if (ghostEl) ghostEl.remove();
        touchDragRef.current = { pointerId: null, fromIndex: null, ghostEl: null, offsetX: 0, offsetY: 0 };
    };

    const insertionIndexAfterRemoval = (fromIndex, insertIndexWithDragged) => {
        if (typeof fromIndex !== 'number' || typeof insertIndexWithDragged !== 'number') return null;
        if (insertIndexWithDragged > fromIndex) return insertIndexWithDragged - 1;
        return insertIndexWithDragged;
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDropOnZone = (e, insertIndexWithDragged) => {
        e.preventDefault();
        const draggedIndexRaw = e.dataTransfer.getData('text/plain');
        const draggedIndex = Number.parseInt(draggedIndexRaw, 10);
        if (Number.isNaN(draggedIndex)) {
            clearDragState();
            return;
        }

        const insertAfterRemoval = insertionIndexAfterRemoval(draggedIndex, insertIndexWithDragged);
        if (insertAfterRemoval == null) {
            clearDragState();
            return;
        }

        if (draggedIndex === insertAfterRemoval) {
            clearDragState();
            return;
        }

        moveNote(draggedIndex, insertAfterRemoval);
        clearDragState();
    };

    const handleDragEnterZone = (insertIndex) => {
        setDragInsertIndex(insertIndex);
    };

    const handleDragLeaveZone = (e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
    };

    const handleGlobalKeyDown = (e) => {
        if (e.key === 'Escape') {
            clearDragState();
        }
    };

    useEffect(() => {
        if (draggingIndex != null || isTouchDragging) {
            window.addEventListener('keydown', handleGlobalKeyDown);
            return () => window.removeEventListener('keydown', handleGlobalKeyDown);
        }
    }, [draggingIndex, isTouchDragging]);

    const updateTouchInsertIndexFromPoint = (clientX, clientY) => {
        const containerEls = Array.from(document.querySelectorAll('.note-container'));
        if (containerEls.length === 0) {
            setDragInsertIndex(0);
            return;
        }

        const hitCandidates = typeof document.elementsFromPoint === 'function'
            ? document.elementsFromPoint(clientX, clientY)
            : (typeof document.elementFromPoint === 'function' ? [document.elementFromPoint(clientX, clientY)] : []);
        const hit = hitCandidates.find(el => el?.classList?.contains('note-container'));
        if (hit && hit.dataset?.index != null) {
            const hoverIndex = Number.parseInt(hit.dataset.index, 10);
            const rect = hit.getBoundingClientRect();
            const before = clientY < rect.top + rect.height / 2;
            setDragInsertIndex(before ? hoverIndex : hoverIndex + 1);
            return;
        }
        const rects = containerEls.map(el => el.getBoundingClientRect());
        const lastRect = rects[rects.length - 1];
        if (clientY > lastRect.bottom) {
            setDragInsertIndex(containerEls.length);
            return;
        }
        const firstRect = rects[0];
        if (clientY < firstRect.top) {
            setDragInsertIndex(0);
        }
    };

    const handleTouchDragStart = ({ fromIndex, noteElement, pointerId, clientX, clientY }) => {
        if (!noteElement) return;
        const rect = noteElement.getBoundingClientRect();
        const ghost = noteElement.cloneNode(true);
        ghost.classList.add('touch-ghost');
        ghost.style.position = 'fixed';
        ghost.style.left = `${clientX - rect.left}px`;
        ghost.style.top = `${clientY - rect.top}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.style.opacity = '0.5';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        document.body.appendChild(ghost);

        touchDragRef.current = {
            pointerId,
            fromIndex,
            ghostEl: ghost,
            offsetX: clientX - rect.left,
            offsetY: clientY - rect.top,
        };
        setIsTouchDragging(true);
        setDraggingIndex(fromIndex);
        updateTouchInsertIndexFromPoint(clientX, clientY);
    };

    useEffect(() => {
        if (!isTouchDragging) return;

        const onPointerMove = (e) => {
            const { pointerId, ghostEl, offsetX, offsetY } = touchDragRef.current;
            if (pointerId == null || e.pointerId !== pointerId) return;
            if (ghostEl) {
                ghostEl.style.left = `${e.clientX - offsetX}px`;
                ghostEl.style.top = `${e.clientY - offsetY}px`;
            }
            updateTouchInsertIndexFromPoint(e.clientX, e.clientY);
        };

        const onPointerUp = (e) => {
            const { pointerId, fromIndex } = touchDragRef.current;
            if (pointerId == null || e.pointerId !== pointerId) return;
            if (fromIndex == null || dragInsertIndex == null) {
                clearDragState();
                return;
            }
            const insertAfterRemoval = insertionIndexAfterRemoval(fromIndex, dragInsertIndex);
            if (insertAfterRemoval != null && insertAfterRemoval !== fromIndex) {
                moveNote(fromIndex, insertAfterRemoval);
            }
            clearDragState();
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
        };
    }, [isTouchDragging, dragInsertIndex, moveNote]);

    return (
        <>
            <CategoryFilter />
            <div 
                className="grid-container"
                ref={gridRef}
                onDragOver={handleDragOver}
            >
                {dropZones.map((zoneIndex) => (
                    <React.Fragment key={`zone-${zoneIndex}`}>
                        <div
                            className={`drop-indicator ${dragInsertIndex === zoneIndex ? 'active' : ''}`}
                            onDragEnter={() => handleDragEnterZone(zoneIndex)}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeaveZone}
                            onDrop={(e) => handleDropOnZone(e, zoneIndex)}
                            aria-hidden="true"
                        />
                        {zoneIndex < notes.length && (
                            <div
                                key={notes[zoneIndex].id}
                                className="note-container"
                                data-index={zoneIndex}
                            >
                                <StickyNote
                                    index={zoneIndex}
                                    note={notes[zoneIndex]}
                                    onNoteChange={updateNote}
                                    onDelete={deleteNote}
                                    onDragStartIndex={setDraggingIndex}
                                    onDragEnd={clearDragState}
                                    onTouchDragStart={handleTouchDragStart}
                                />
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </>
    )
}

export default StickyNotesGrid