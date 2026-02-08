import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Action, CommandPaletteProps } from './types';
import './CommandPalette.css';

export const CommandPalette: React.FC<CommandPaletteProps> = ({ actions }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const resultsListRef = useRef<HTMLUListElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const focusTimeoutRef = useRef<number | null>(null);
    const isExecutingRef = useRef(false);

    // Filter actions based on query
    const filteredActions = useMemo(() => {
        if (!query.trim()) return actions;
        const lowerQuery = query.toLowerCase();
        return actions.filter(action =>
            action.title.toLowerCase().includes(lowerQuery)
        );
    }, [actions, query]);

    // Group filtered actions by category
    const groupedActions = useMemo(() => {
        const groups: Record<string, Action[]> = {};
        filteredActions.forEach(action => {
            if (!groups[action.category]) {
                groups[action.category] = [];
            }
            groups[action.category].push(action);
        });
        return groups;
    }, [filteredActions]);

    // Get flat list of selectable actions (for keyboard navigation)
    const selectableActions = useMemo(() => filteredActions, [filteredActions]);

    // Reset active index when filtered results change
    useEffect(() => {
        setActiveIndex(0);
    }, [filteredActions]);

    // Global keyboard shortcut handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modifierKey = isMac ? e.metaKey : e.ctrlKey;

            if (modifierKey && e.key === 'k') {
                // Check if user is typing in an editable element
                const target = e.target as HTMLElement;

                // Allow shortcut in our own search input (for toggling closed)
                const isOurSearchInput = target === searchInputRef.current;

                const isEditable =
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable ||
                    target.closest?.('[contenteditable]') !== null;

                if (!isEditable || isOurSearchInput) {
                    e.preventDefault();
                    setIsOpen(prev => !prev);
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Handle opening/closing
    useEffect(() => {
        if (isOpen) {
            // Store previously focused element
            previousFocusRef.current = document.activeElement as HTMLElement;

            // Focus search input
            focusTimeoutRef.current = window.setTimeout(() => searchInputRef.current?.focus(), 0);

            // Disable background scrolling
            document.body.style.overflow = 'hidden';
        } else {
            // Restore focus
            if (previousFocusRef.current) {
                previousFocusRef.current.focus();
            }

            // Re-enable scrolling
            document.body.style.overflow = '';

            // Reset state
            setQuery('');
            setActiveIndex(0);
            isExecutingRef.current = false;
        }

        // Cleanup on unmount
        return () => {
            document.body.style.overflow = '';
            if (focusTimeoutRef.current !== null) {
                clearTimeout(focusTimeoutRef.current);
                focusTimeoutRef.current = null;
            }
        };
    }, [isOpen]);

    // Keyboard navigation within palette
    const handlePaletteKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (selectableActions.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prev => (prev + 1) % selectableActions.length);
                break;

            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev =>
                    prev === 0 ? selectableActions.length - 1 : prev - 1
                );
                break;

            case 'Home':
                e.preventDefault();
                setActiveIndex(0);
                break;

            case 'End':
                e.preventDefault();
                setActiveIndex(selectableActions.length - 1);
                break;

            case 'Enter':
                e.preventDefault();
                if (selectableActions[activeIndex]) {
                    executeAction(selectableActions[activeIndex]);
                }
                break;

            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                break;
        }
    }, [selectableActions, activeIndex]);

    // Execute action and handle errors
    const executeAction = useCallback(async (action: Action) => {
        // Prevent duplicate execution
        if (isExecutingRef.current) return;

        isExecutingRef.current = true;
        try {
            await action.onExecute();
        } catch (error) {
            console.error('Error executing action:', error);
        } finally {
            setIsOpen(false);
        }
    }, []);

    // Focus trap implementation
    const handleTabKey = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            // Keep focus on search input (simple focus trap)
            searchInputRef.current?.focus();
        }
    }, []);

    // Handle backdrop click
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            setIsOpen(false);
        }
    }, []);

    if (!isOpen) return null;

    return (
        <div
            className="command-palette-backdrop"
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-palette-label"
        >
            <div
                className="command-palette"
                onKeyDown={(e) => {
                    handleTabKey(e);
                    handlePaletteKeyDown(e);
                }}
            >
                <div className="command-palette-header">
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="command-palette-input"
                        placeholder="Type a command or search..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search commands"
                        aria-controls="command-palette-results"
                        aria-activedescendant={
                            selectableActions[activeIndex]
                                ? `action-${selectableActions[activeIndex].id}`
                                : undefined
                        }
                    />
                </div>

                <div className="command-palette-results">
                    {Object.keys(groupedActions).length === 0 ? (
                        <div className="command-palette-empty" role="status" aria-live="polite">
                            No commands found
                        </div>
                    ) : (
                        <ul
                            ref={resultsListRef}
                            id="command-palette-results"
                            className="command-palette-list"
                            role="listbox"
                            aria-label="Command results"
                        >
                            {Object.entries(groupedActions).map(([category, categoryActions]) => (
                                <React.Fragment key={category}>
                                    <li className="command-palette-category" role="presentation">
                                        {category}
                                    </li>
                                    {categoryActions.map((action) => {
                                        const globalIndex = selectableActions.indexOf(action);
                                        const isActive = globalIndex === activeIndex;

                                        return (
                                            <li
                                                key={action.id}
                                                id={`action-${action.id}`}
                                                className={`command-palette-item ${isActive ? 'active' : ''}`}
                                                role="option"
                                                aria-selected={isActive}
                                                onClick={() => executeAction(action)}
                                            >
                                                {action.title}
                                            </li>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="command-palette-footer" role="status" aria-live="polite" aria-atomic="true">
                    {selectableActions.length} {selectableActions.length === 1 ? 'result' : 'results'}
                </div>
            </div>
        </div>
    );
};
