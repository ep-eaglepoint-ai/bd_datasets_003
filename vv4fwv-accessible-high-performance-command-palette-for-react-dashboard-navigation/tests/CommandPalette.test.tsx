import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '../src/CommandPalette';
import { Action } from '../src/types';

describe('CommandPalette', () => {
    let mockActions: Action[];
    let user: ReturnType<typeof userEvent.setup>;

    beforeEach(() => {
        user = userEvent.setup();

        mockActions = [
            {
                id: '1',
                title: 'Go to Dashboard',
                category: 'Navigation',
                onExecute: vi.fn(),
            },
            {
                id: '2',
                title: 'Go to Settings',
                category: 'Navigation',
                onExecute: vi.fn(),
            },
            {
                id: '3',
                title: 'Create Project',
                category: 'Actions',
                onExecute: vi.fn(),
            },
            {
                id: '4',
                title: 'Delete Project',
                category: 'Actions',
                onExecute: vi.fn(),
            },
            {
                id: '5',
                title: 'View Documentation',
                category: 'Help',
                onExecute: vi.fn(),
            },
        ];
    });

    afterEach(() => {
        // Restore body overflow
        document.body.style.overflow = '';
    });

    describe('Keyboard Shortcut Triggering', () => {
        it('should open palette when Cmd+K is pressed on Mac', async () => {
            // Mock Mac platform
            Object.defineProperty(navigator, 'platform', {
                value: 'MacIntel',
                configurable: true,
            });

            render(<CommandPalette actions={mockActions} />);

            // Palette should not be visible initially
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

            // Press Cmd+K
            await user.keyboard('{Meta>}k{/Meta}');

            // Palette should be visible
            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
            });
        });

        it('should open palette when Ctrl+K is pressed on Windows/Linux', async () => {
            // Mock Windows platform
            Object.defineProperty(navigator, 'platform', {
                value: 'Win32',
                configurable: true,
            });

            render(<CommandPalette actions={mockActions} />);

            // Press Ctrl+K
            await user.keyboard('{Control>}k{/Control}');

            // Palette should be visible
            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
            });
        });

        it('should toggle palette when shortcut is pressed multiple times', async () => {
            render(<CommandPalette actions={mockActions} />);

            // Open
            await user.keyboard('{Control>}k{/Control}');
            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
            });

            // Close
            await user.keyboard('{Control>}k{/Control}');
            await waitFor(() => {
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            });
        });
    });

    describe('Blocked Triggers in Text Inputs', () => {
        it('should not open palette when Ctrl+K is pressed inside input element', async () => {
            render(
                <div>
                    <input type="text" data-testid="test-input" />
                    <CommandPalette actions={mockActions} />
                </div>
            );

            const input = screen.getByTestId('test-input');
            await user.click(input);

            // Press Ctrl+K while focused on input
            await user.keyboard('{Control>}k{/Control}');

            // Palette should NOT be visible
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('should not open palette when Ctrl+K is pressed inside textarea element', async () => {
            render(
                <div>
                    <textarea data-testid="test-textarea" />
                    <CommandPalette actions={mockActions} />
                </div>
            );

            const textarea = screen.getByTestId('test-textarea');
            await user.click(textarea);

            // Press Ctrl+K while focused on textarea
            await user.keyboard('{Control>}k{/Control}');

            // Palette should NOT be visible
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('should not open palette when Ctrl+K is pressed inside contenteditable element', async () => {
            render(
                <div>
                    <div contentEditable data-testid="test-contenteditable">
                        Editable content
                    </div>
                    <CommandPalette actions={mockActions} />
                </div>
            );

            const contentEditable = screen.getByTestId('test-contenteditable');
            await user.click(contentEditable);

            // Press Ctrl+K while focused on contenteditable
            await user.keyboard('{Control>}k{/Control}');

            // Palette should NOT be visible
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    describe('Search Filtering and Result Updates', () => {
        it('should display all actions when search is empty', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
                expect(screen.getByText('Go to Settings')).toBeInTheDocument();
                expect(screen.getByText('Create Project')).toBeInTheDocument();
                expect(screen.getByText('Delete Project')).toBeInTheDocument();
                expect(screen.getByText('View Documentation')).toBeInTheDocument();
            });
        });

        it('should filter actions based on case-insensitive search', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            const searchInput = await screen.findByPlaceholderText(/Type a command/i);
            await user.type(searchInput, 'project');

            await waitFor(() => {
                expect(screen.getByText('Create Project')).toBeInTheDocument();
                expect(screen.getByText('Delete Project')).toBeInTheDocument();
                expect(screen.queryByText('Go to Dashboard')).not.toBeInTheDocument();
                expect(screen.queryByText('Go to Settings')).not.toBeInTheDocument();
            });
        });

        it('should show empty state when no results match', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            const searchInput = await screen.findByPlaceholderText(/Type a command/i);
            await user.type(searchInput, 'nonexistent');

            await waitFor(() => {
                expect(screen.getByText('No commands found')).toBeInTheDocument();
            });
        });

        it('should reset active index when search results change', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            // Navigate down
            await user.keyboard('{ArrowDown}');
            await user.keyboard('{ArrowDown}');

            const searchInput = await screen.findByPlaceholderText(/Type a command/i);

            // Filter results
            await user.type(searchInput, 'dashboard');

            // First result should be active
            await waitFor(() => {
                const activeItem = screen.getByText('Go to Dashboard');
                expect(activeItem).toHaveClass('active');
            });
        });

        it('should update result count dynamically', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            // Check initial count
            await waitFor(() => {
                expect(screen.getByText('5 results')).toBeInTheDocument();
            });

            const searchInput = await screen.findByPlaceholderText(/Type a command/i);
            await user.type(searchInput, 'project');

            // Check updated count
            await waitFor(() => {
                expect(screen.getByText('2 results')).toBeInTheDocument();
            });
        });
    });

    describe('Dynamic Action List Updates', () => {
        it('should handle actions being replaced while palette is open', async () => {
            const { rerender } = render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
            });

            // Replace actions
            const newActions: Action[] = [
                {
                    id: '6',
                    title: 'New Action',
                    category: 'New',
                    onExecute: vi.fn(),
                },
            ];

            rerender(<CommandPalette actions={newActions} />);

            await waitFor(() => {
                expect(screen.getByText('New Action')).toBeInTheDocument();
                expect(screen.queryByText('Go to Dashboard')).not.toBeInTheDocument();
            });
        });
    });

    describe('Keyboard Navigation', () => {
        it('should navigate down with ArrowDown key', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            // First item should be active initially
            await waitFor(() => {
                const firstItem = screen.getByText('Go to Dashboard');
                expect(firstItem).toHaveClass('active');
            });

            // Navigate down
            await user.keyboard('{ArrowDown}');

            await waitFor(() => {
                const secondItem = screen.getByText('Go to Settings');
                expect(secondItem).toHaveClass('active');
            });
        });

        it('should navigate up with ArrowUp key', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            // Navigate down twice
            await user.keyboard('{ArrowDown}');
            await user.keyboard('{ArrowDown}');

            // Navigate up
            await user.keyboard('{ArrowUp}');

            await waitFor(() => {
                const secondItem = screen.getByText('Go to Settings');
                expect(secondItem).toHaveClass('active');
            });
        });

        it('should wrap around when navigating down past last item', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            // Navigate to last item and beyond
            // Start at index 0, press down 5 times to reach index 4 (last), then once more to wrap to index 0
            for (let i = 0; i < 5; i++) {
                await user.keyboard('{ArrowDown}');
            }

            // Should wrap to first item
            await waitFor(() => {
                const firstItem = screen.getByText('Go to Dashboard');
                expect(firstItem).toHaveClass('active');
            });
        });

        it('should wrap around when navigating up from first item', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            // Navigate up from first item
            await user.keyboard('{ArrowUp}');

            // Should wrap to last item
            await waitFor(() => {
                const lastItem = screen.getByText('View Documentation');
                expect(lastItem).toHaveClass('active');
            });
        });

        it('should jump to first item with Home key', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            // Navigate to middle
            await user.keyboard('{ArrowDown}');
            await user.keyboard('{ArrowDown}');

            // Press Home
            await user.keyboard('{Home}');

            await waitFor(() => {
                const firstItem = screen.getByText('Go to Dashboard');
                expect(firstItem).toHaveClass('active');
            });
        });

        it('should jump to last item with End key', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            // Press End
            await user.keyboard('{End}');

            await waitFor(() => {
                const lastItem = screen.getByText('View Documentation');
                expect(lastItem).toHaveClass('active');
            });
        });
    });

    describe('Focus Trap', () => {
        it('should focus search input when palette opens', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                const searchInput = screen.getByPlaceholderText(/Type a command/i);
                expect(searchInput).toHaveFocus();
            });
        });

        it('should prevent Tab from leaving the palette', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            const searchInput = await screen.findByPlaceholderText(/Type a command/i);

            // Try to tab away
            await user.keyboard('{Tab}');

            // Focus should remain on search input
            expect(searchInput).toHaveFocus();
        });

        it('should restore focus to previous element when palette closes', async () => {
            render(
                <div>
                    <button data-testid="test-button">Test Button</button>
                    <CommandPalette actions={mockActions} />
                </div>
            );

            const button = screen.getByTestId('test-button');
            await user.click(button);

            expect(button).toHaveFocus();

            // Open palette
            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
            });

            // Close palette
            await user.keyboard('{Escape}');

            await waitFor(() => {
                expect(button).toHaveFocus();
            });
        });
    });

    describe('Action Execution and Error Handling', () => {
        it('should execute action when Enter is pressed', async () => {
            const executeMock = vi.fn();
            const actionsWithMock: Action[] = [
                {
                    id: '1',
                    title: 'Test Action',
                    category: 'Test',
                    onExecute: executeMock,
                },
            ];

            render(<CommandPalette actions={actionsWithMock} />);

            await user.keyboard('{Control>}k{/Control}');
            await user.keyboard('{Enter}');

            await waitFor(() => {
                expect(executeMock).toHaveBeenCalledTimes(1);
            });
        });

        it('should execute action when item is clicked', async () => {
            const executeMock = vi.fn();
            const actionsWithMock: Action[] = [
                {
                    id: '1',
                    title: 'Test Action',
                    category: 'Test',
                    onExecute: executeMock,
                },
            ];

            render(<CommandPalette actions={actionsWithMock} />);

            await user.keyboard('{Control>}k{/Control}');

            const actionItem = await screen.findByText('Test Action');
            await user.click(actionItem);

            await waitFor(() => {
                expect(executeMock).toHaveBeenCalledTimes(1);
            });
        });

        it('should close palette after action execution', async () => {
            const executeMock = vi.fn();
            const actionsWithMock: Action[] = [
                {
                    id: '1',
                    title: 'Test Action',
                    category: 'Test',
                    onExecute: executeMock,
                },
            ];

            render(<CommandPalette actions={actionsWithMock} />);

            await user.keyboard('{Control>}k{/Control}');
            await user.keyboard('{Enter}');

            await waitFor(() => {
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            });
        });

        it('should handle errors during action execution gracefully', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const errorAction: Action[] = [
                {
                    id: '1',
                    title: 'Error Action',
                    category: 'Test',
                    onExecute: () => {
                        throw new Error('Test error');
                    },
                },
            ];

            render(<CommandPalette actions={errorAction} />);

            await user.keyboard('{Control>}k{/Control}');
            await user.keyboard('{Enter}');

            await waitFor(() => {
                expect(consoleErrorSpy).toHaveBeenCalled();
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            });

            consoleErrorSpy.mockRestore();
        });


        it('should handle async action execution', async () => {
            const asyncExecuteMock = vi.fn().mockResolvedValue(undefined);
            const asyncActions: Action[] = [
                {
                    id: '1',
                    title: 'Async Action',
                    category: 'Test',
                    onExecute: asyncExecuteMock,
                },
            ];

            render(<CommandPalette actions={asyncActions} />);

            await user.keyboard('{Control>}k{/Control}');
            await user.keyboard('{Enter}');

            await waitFor(() => {
                expect(asyncExecuteMock).toHaveBeenCalledTimes(1);
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            });
        });

        it('should prevent duplicate execution on rapid Enter presses', async () => {
            let resolveAction: () => void;
            const asyncPromise = new Promise<void>((resolve) => {
                resolveAction = resolve;
            });

            const asyncExecuteMock = vi.fn().mockReturnValue(asyncPromise);
            const asyncActions: Action[] = [
                {
                    id: '1',
                    title: 'Async Action',
                    category: 'Test',
                    onExecute: asyncExecuteMock,
                },
            ];

            render(<CommandPalette actions={asyncActions} />);

            await user.keyboard('{Control>}k{/Control}');

            // Rapidly press Enter multiple times
            await user.keyboard('{Enter}');
            await user.keyboard('{Enter}');
            await user.keyboard('{Enter}');

            // Action should only be called once
            expect(asyncExecuteMock).toHaveBeenCalledTimes(1);

            // Resolve the async action
            resolveAction!();

            await waitFor(() => {
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            });
        });

        it('should prevent duplicate execution on rapid clicks', async () => {
            let resolveAction: () => void;
            const asyncPromise = new Promise<void>((resolve) => {
                resolveAction = resolve;
            });

            const asyncExecuteMock = vi.fn().mockReturnValue(asyncPromise);
            const asyncActions: Action[] = [
                {
                    id: '1',
                    title: 'Async Action',
                    category: 'Test',
                    onExecute: asyncExecuteMock,
                },
            ];

            render(<CommandPalette actions={asyncActions} />);

            await user.keyboard('{Control>}k{/Control}');

            const actionItem = await screen.findByText('Async Action');

            // Rapidly click multiple times
            await user.click(actionItem);
            await user.click(actionItem);
            await user.click(actionItem);

            // Action should only be called once
            expect(asyncExecuteMock).toHaveBeenCalledTimes(1);

            // Resolve the async action
            resolveAction!();

            await waitFor(() => {
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            });
        });

        it('should prevent mixed Enter and click during async execution', async () => {
            let resolveAction: () => void;
            const asyncPromise = new Promise<void>((resolve) => {
                resolveAction = resolve;
            });

            const asyncExecuteMock = vi.fn().mockReturnValue(asyncPromise);
            const asyncActions: Action[] = [
                {
                    id: '1',
                    title: 'Async Action',
                    category: 'Test',
                    onExecute: asyncExecuteMock,
                },
            ];

            render(<CommandPalette actions={asyncActions} />);

            await user.keyboard('{Control>}k{/Control}');

            const actionItem = await screen.findByText('Async Action');

            // Mix Enter and clicks
            await user.keyboard('{Enter}');
            await user.click(actionItem);
            await user.keyboard('{Enter}');

            // Action should only be called once
            expect(asyncExecuteMock).toHaveBeenCalledTimes(1);

            // Resolve the async action
            resolveAction!();

            await waitFor(() => {
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            });
        });
    });

    describe('Cleanup After Unmount', () => {
        it('should remove event listeners when component unmounts', async () => {
            const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
            const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

            const { unmount } = render(<CommandPalette actions={mockActions} />);

            // Verify listener was added
            expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

            const addedListener = addEventListenerSpy.mock.calls.find(
                call => call[0] === 'keydown'
            )?.[1];

            unmount();

            // Verify listener was removed
            expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', addedListener);

            addEventListenerSpy.mockRestore();
            removeEventListenerSpy.mockRestore();
        });

        it('should restore body overflow when unmounted while open', async () => {
            const { unmount } = render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                expect(document.body.style.overflow).toBe('hidden');
            });

            unmount();

            expect(document.body.style.overflow).toBe('');
        });
    });

    describe('Accessibility Features', () => {
        it('should have proper ARIA roles', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
                expect(screen.getByRole('listbox')).toBeInTheDocument();
                expect(screen.getAllByRole('option')).toHaveLength(5);
            });
        });

        it('should set aria-selected on active item', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                const firstItem = screen.getByText('Go to Dashboard');
                expect(firstItem).toHaveAttribute('aria-selected', 'true');
            });

            await user.keyboard('{ArrowDown}');

            await waitFor(() => {
                const secondItem = screen.getByText('Go to Settings');
                expect(secondItem).toHaveAttribute('aria-selected', 'true');
            });
        });

        it('should set aria-activedescendant on search input', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                const searchInput = screen.getByPlaceholderText(/Type a command/i);
                expect(searchInput).toHaveAttribute('aria-activedescendant', 'action-1');
            });

            await user.keyboard('{ArrowDown}');

            await waitFor(() => {
                const searchInput = screen.getByPlaceholderText(/Type a command/i);
                expect(searchInput).toHaveAttribute('aria-activedescendant', 'action-2');
            });
        });

        it('should announce result count changes to screen readers', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            const resultStatus = await screen.findByText('5 results');
            expect(resultStatus).toHaveAttribute('aria-live', 'polite');
            expect(resultStatus).toHaveAttribute('aria-atomic', 'true');
        });

        it('should have accessible empty state', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            const searchInput = await screen.findByPlaceholderText(/Type a command/i);
            await user.type(searchInput, 'nonexistent');

            const emptyState = await screen.findByText('No commands found');
            expect(emptyState).toHaveAttribute('role', 'status');
            expect(emptyState).toHaveAttribute('aria-live', 'polite');
        });

        it('should not expose category headers as selectable options', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                const categoryHeaders = screen.getAllByText(/Navigation|Actions|Help/);
                categoryHeaders.forEach(header => {
                    expect(header).toHaveAttribute('role', 'presentation');
                    expect(header).not.toHaveAttribute('aria-selected');
                });
            });
        });
    });

    describe('Scroll Lock', () => {
        it('should disable background scrolling when palette is open', async () => {
            render(<CommandPalette actions={mockActions} />);

            expect(document.body.style.overflow).toBe('');

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                expect(document.body.style.overflow).toBe('hidden');
            });
        });

        it('should restore scrolling when palette closes', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                expect(document.body.style.overflow).toBe('hidden');
            });

            await user.keyboard('{Escape}');

            await waitFor(() => {
                expect(document.body.style.overflow).toBe('');
            });
        });
    });

    describe('Category Grouping', () => {
        it('should group actions by category', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            await waitFor(() => {
                expect(screen.getByText('Navigation')).toBeInTheDocument();
                expect(screen.getByText('Actions')).toBeInTheDocument();
                expect(screen.getByText('Help')).toBeInTheDocument();
            });
        });

        it('should not render categories with zero visible actions', async () => {
            render(<CommandPalette actions={mockActions} />);

            await user.keyboard('{Control>}k{/Control}');

            const searchInput = await screen.findByPlaceholderText(/Type a command/i);
            await user.type(searchInput, 'dashboard');

            await waitFor(() => {
                expect(screen.getByText('Navigation')).toBeInTheDocument();
                expect(screen.queryByText('Actions')).not.toBeInTheDocument();
                expect(screen.queryByText('Help')).not.toBeInTheDocument();
            });
        });
    });
});
