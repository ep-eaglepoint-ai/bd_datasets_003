import React from 'react';
import { renderHook, act } from '@testing-library/react';

const resolveRepoFolder = () => {
  const raw = (process.env.REPO_PATH || 'repository_after').trim();
  if (raw.includes('repository_before')) return 'repository_before';
  if (raw.includes('repository_after')) return 'repository_after';
  return 'repository_after';
};

const getContext = () => {
  const repoPath = resolveRepoFolder();
  return require(`../../${repoPath}/src/context/StickyNotesContext`);
};

const repoPath = resolveRepoFolder();
const describeAfter = repoPath === 'repository_after' ? describe : describe.skip;
const describeBefore = repoPath === 'repository_before' ? describe : describe.skip;

describeBefore('StickyNotesContext - repository_before (baseline)', () => {
  test('should allow adding a note', () => {
    const context = getContext();
    const StickyNotesProvider = context.default;
    const useStickyNotes = context.useStickyNotes;
    const wrapper = ({ children }) => React.createElement(StickyNotesProvider, null, children);
    const { result } = renderHook(() => useStickyNotes(), { wrapper });

    act(() => {
      result.current.addNewNote();
    });

    expect(result.current.notes.length).toBe(1);
    expect(result.current.notes[0].title).toBe('Click to edit title');
  });
});

describeAfter('StickyNotesContext - repository_after', () => {
  let StickyNotesProvider, useStickyNotes;
  
  beforeEach(() => {
    localStorage.clear();
    const context = getContext();
    StickyNotesProvider = context.default;
    useStickyNotes = context.useStickyNotes;
  });

  const wrapper = ({ children }) => React.createElement(StickyNotesProvider, null, children);

  test('should migrate existing notes to have order and category fields', () => {
    const oldFormatNotes = [
      { id: 1, title: 'Old Note 1', content: 'Content 1', color: '#ffd500' },
      { id: 2, title: 'Old Note 2', content: 'Content 2', color: '#ff0000' }
    ];
    localStorage.setItem('notes', JSON.stringify(oldFormatNotes));

    const { result } = renderHook(() => useStickyNotes(), { wrapper });
    
    expect(result.current.notes).toHaveLength(2);
    expect(result.current.notes[0]).toMatchObject({
      id: 1,
      title: 'Old Note 1',
      order: 0,
      category: 'uncategorized'
    });
    expect(result.current.notes[1]).toMatchObject({
      id: 2,
      title: 'Old Note 2',
      order: 1,
      category: 'uncategorized'
    });
  });

  test('should add new note with default category and order', () => {
    const { result } = renderHook(() => useStickyNotes(), { wrapper });
    
    act(() => {
      result.current.addNewNote();
    });

    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0]).toMatchObject({
      title: 'Click to edit title',
      content: 'Click to edit content',
      category: 'uncategorized',
      order: 0
    });
  });

  test('should move note and update order correctly', () => {
    const { result } = renderHook(() => useStickyNotes(), { wrapper });

    act(() => {
      result.current.addNewNote();
      result.current.addNewNote();
      result.current.addNewNote();
    });

    const noteIds = result.current.notes.map(n => n.id);

    act(() => {
      result.current.moveNote(0, 2);
    });
    expect(result.current.notes[2].id).toBe(noteIds[0]);
    result.current.notes.forEach((note, index) => {
      expect(note.order).toBe(index);
    });
  });

  test('should update note category', () => {
    const { result } = renderHook(() => useStickyNotes(), { wrapper });
    
    act(() => {
      result.current.addNewNote();
    });

    const noteId = result.current.notes[0].id;
    
    act(() => {
      result.current.updateNoteCategory(noteId, 'work');
    });

    expect(result.current.notes[0].category).toBe('work');
  });

  test('should filter notes by selected category', () => {
    const { result } = renderHook(() => useStickyNotes(), { wrapper });
    act(() => {
      result.current.addNewNote();
      result.current.addNewNote();
      result.current.addNewNote();
    });

    const [id0, id1, id2] = result.current.notes.map(n => n.id);

    act(() => {
      result.current.updateNoteCategory(id0, 'work');
      result.current.updateNoteCategory(id1, 'personal');
      result.current.updateNoteCategory(id2, 'work');
    });

    act(() => {
      result.current.setSelectedCategory('work');
    });

    expect(result.current.notes).toHaveLength(2);
    result.current.notes.forEach(note => {
      expect(note.category).toBe('work');
    });

    act(() => {
      result.current.setSelectedCategory('all');
    });

    expect(result.current.notes).toHaveLength(3);
  });

  test('should delete note and reorder remaining notes', () => {
    const { result } = renderHook(() => useStickyNotes(), { wrapper });

    act(() => {
      result.current.addNewNote();
      result.current.addNewNote();
      result.current.addNewNote();
    });

    const noteToDelete = result.current.notes[1];
    
    act(() => {
      result.current.deleteNote(noteToDelete.id);
    });
    expect(result.current.notes).toHaveLength(2);
    result.current.notes.forEach((note, index) => {
      expect(note.order).toBe(index);
    });
  });

  test('should move notes within a filtered category without moving others', () => {
    const { result } = renderHook(() => useStickyNotes(), { wrapper });

    act(() => {
      result.current.addNewNote();
      result.current.addNewNote();
      result.current.addNewNote();
    });

    const ids = result.current.notes.map(n => n.id);

    act(() => {
      result.current.updateNoteCategory(ids[0], 'work');
      result.current.updateNoteCategory(ids[1], 'personal');
      result.current.updateNoteCategory(ids[2], 'work');
      result.current.setSelectedCategory('work');
    });

    const visibleIds = result.current.notes.map(n => n.id);
    expect(visibleIds).toHaveLength(2);

    act(() => {
      // Swap within the filtered list
      result.current.moveNote(0, 1);
    });

    const visibleIdsAfter = result.current.notes.map(n => n.id);
    expect(visibleIdsAfter).toEqual([visibleIds[1], visibleIds[0]]);
  });
});