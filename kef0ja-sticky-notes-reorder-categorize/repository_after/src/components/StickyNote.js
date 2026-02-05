import React, { useEffect, useState, useRef } from 'react'
import useDebounce from '../hooks/useDebounce'
import ColorCustomizer from './ColorCustomizer'
import { useStickyNotes } from '../context/StickyNotesContext'
import { ColorSvgIcon, CrossSvgIcon, DragSvgIcon } from './SvgIcons'
import "./StickyNote.css"

const StickyNote = (props) => {
    const { categories, updateNoteCategory } = useStickyNotes();
    const [title, setTitle] = useState(props.note.title);
    const [content, setContent] = useState(props.note.content);
    const [editingTitle, setEditingTitle] = useState(false);
    const [editingContent, setEditingContent] = useState(false);
    const [isColorCustomizerVisible, setIsColorCustomizerVisible] = useState(false);
    const [isCategoryDropdownVisible, setIsCategoryDropdownVisible] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    
    const dragHandleRef = useRef(null);
    const noteRef = useRef(null);
    const debouncedTitle = useDebounce(title, 500);
    const debouncedContent = useDebounce(content, 500);
    useEffect(() => {
        if (debouncedTitle === '' || debouncedContent === '') return;
        if (debouncedTitle === props.note.title && debouncedContent === props.note.content) return;
        props.onNoteChange({ id: props.note.id, title: debouncedTitle, content: debouncedContent });
    }, [debouncedTitle, debouncedContent, props]);
    const currentCategory = categories.find(cat => cat.id === props.note.category) || categories[4];
    const handleDragStart = (e) => {
        if (editingTitle || editingContent) {
            e.preventDefault();
            return;
        }
        
        setIsDragging(true);
        e.dataTransfer.setData('text/plain', String(props.index));
        e.dataTransfer.effectAllowed = 'move';
        if (noteRef.current && e.dataTransfer?.setDragImage) {
            const ghost = noteRef.current.cloneNode(true);
            ghost.style.opacity = '0.5';
            ghost.style.position = 'absolute';
            ghost.style.top = '-1000px';
            document.body.appendChild(ghost);
            try {
                e.dataTransfer.setDragImage(ghost, 0, 0);
            } finally {
                // Remove synchronously so Jest fake timers don't leak DOM nodes between tests.
                ghost.remove();
            }
        }
    };

    const handleDragEnd = () => {
        setIsDragging(false);
        document.querySelectorAll('.drop-zone').forEach(el => {
            el.classList.remove('drop-zone-active');
        });
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (e.currentTarget.classList.contains('drop-zone')) {
            e.currentTarget.classList.add('drop-zone-active');
        }
    };

    const handleDragLeave = (e) => {
        if (e.currentTarget.classList.contains('drop-zone')) {
            e.currentTarget.classList.remove('drop-zone-active');
        }
    };
    function handleOnTitleChange(e) {
        setTitle(e.target.value);
    }

    function handleOnContentChange(e) {
        setContent(e.target.value);
    }

    function handleInputOnBlur() {
        if (title === '') {
            setTitle('Enter the note title');
            return
        }
        setEditingTitle(false)
    }

    function handleInputKeyDown(e) {
        if (e.key === 'Enter') {
            if (title === '') {
                setTitle('Enter the note title');
                return
            }
            setEditingTitle(false);
        }
        if (e.key === 'Escape') {
            setEditingTitle(false);
            setTitle(props.note.title);
        }
    }

    function handleTextAreaOnBlur() {
        if (content === '') {
            setContent('Enter the note content');
            return
        }
        setEditingContent(false)
    }

    function handleTextAreaKeyDown(e) {
        if (e.key === 'Escape') {
            setEditingContent(false);
            setContent(props.note.content);
        }
    }

    function handleOnColorChange(color) {
        props.onNoteChange({ id: props.note.id, color });
        setIsColorCustomizerVisible(false);
    }

    function handleCategoryChange(categoryId) {
        updateNoteCategory(props.note.id, categoryId);
        setIsCategoryDropdownVisible(false);
    }
    const handleNoteKeyDown = (e) => {
        if (e.key === 'Enter') {
            if (!editingTitle && !editingContent) {
                setEditingTitle(true);
            }
        }
    };

    return (
        <div 
            ref={noteRef}
            className={`sticky-note ${isDragging ? 'dragging' : ''}`}
            style={{ backgroundColor: props.note.color }}
            draggable={false}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            tabIndex={0}
            onKeyDown={handleNoteKeyDown}
        >
            <div className='sticky-header'>
                <button 
                    ref={dragHandleRef}
                    className='sticky-note-circular-button drag-handle'
                    title="Drag to reorder"
                    draggable={!editingTitle && !editingContent}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <DragSvgIcon />
                </button>
                
                <button 
                    className='sticky-note-circular-button' 
                    title="Category"
                    onClick={() => setIsCategoryDropdownVisible(!isCategoryDropdownVisible)}
                >
                    <div className="category-badge" style={{ backgroundColor: currentCategory.color }} />
                </button>
                
                <button 
                    className='sticky-note-circular-button' 
                    title="Color"
                    onClick={() => setIsColorCustomizerVisible(!isColorCustomizerVisible)}
                >
                    <ColorSvgIcon />
                </button>
                
                <button 
                    className='sticky-note-circular-button' 
                    title='Delete' 
                    onClick={() => props.onDelete(props.note.id)}
                >
                    <CrossSvgIcon />
                </button>
            </div>
            
            {isColorCustomizerVisible && <ColorCustomizer onColorChange={handleOnColorChange} />}
            
            {isCategoryDropdownVisible && (
                <div className="category-dropdown" style={{ top: isColorCustomizerVisible ? '120px' : '50px' }}>
                    {categories.map(category => (
                        <button
                            key={category.id}
                            className="category-dropdown-item"
                            style={{ backgroundColor: category.color }}
                            onClick={() => handleCategoryChange(category.id)}
                        >
                            {category.name}
                        </button>
                    ))}
                </div>
            )}

            
            <div className="category-display">
                <span 
                    className="category-badge-small"
                    style={{ backgroundColor: currentCategory.color }}
                >
                    {currentCategory.name}
                </span>
            </div>
            
            <>
                {!editingTitle && (
                    <div 
                        className='sticky-note-title' 
                        onClick={() => !isColorCustomizerVisible && !isCategoryDropdownVisible && setEditingTitle(true)}
                    >
                        {title}
                    </div>
                )}
                {editingTitle && !isColorCustomizerVisible && !isCategoryDropdownVisible && (
                    <input
                        className='sticky-note-title-input'
                        autoFocus
                        type="text"
                        value={title}
                        onChange={handleOnTitleChange}
                        onBlur={handleInputOnBlur}
                        onKeyDown={handleInputKeyDown}
                    />
                )}
            </>
            
            <>
                {!editingContent && (
                    <div 
                        className='sticky-note-content' 
                        onClick={() => !isColorCustomizerVisible && !isCategoryDropdownVisible && setEditingContent(true)}
                    >
                        {content}
                    </div>
                )}
                {editingContent && !isColorCustomizerVisible && !isCategoryDropdownVisible && (
                    <textarea
                        className='sticky-note-content-input'
                        cols={30}
                        rows={10}
                        autoFocus
                        value={content}
                        onChange={handleOnContentChange}
                        onBlur={handleTextAreaOnBlur}
                        onKeyDown={handleTextAreaKeyDown}
                    />
                )}
            </>
        </div>
    )
}

export default StickyNote