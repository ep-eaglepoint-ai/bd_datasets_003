import React, { useState } from 'react';
import { CommandPalette } from './CommandPalette';
import { Action } from './types';
import './App.css';

function App() {
    const [notifications, setNotifications] = useState<string[]>([]);

    const addNotification = (message: string) => {
        setNotifications(prev => [...prev, message]);
        setTimeout(() => {
            setNotifications(prev => prev.slice(1));
        }, 3000);
    };

    const actions: Action[] = [
        // Navigation
        {
            id: 'nav-home',
            title: 'Go to Home',
            category: 'Navigation',
            onExecute: () => addNotification('Navigating to Home...'),
        },
        {
            id: 'nav-dashboard',
            title: 'Go to Dashboard',
            category: 'Navigation',
            onExecute: () => addNotification('Navigating to Dashboard...'),
        },
        {
            id: 'nav-profile',
            title: 'Go to Profile',
            category: 'Navigation',
            onExecute: () => addNotification('Navigating to Profile...'),
        },
        {
            id: 'nav-settings',
            title: 'Go to Settings',
            category: 'Navigation',
            onExecute: () => addNotification('Navigating to Settings...'),
        },

        // Actions
        {
            id: 'action-new-project',
            title: 'Create New Project',
            category: 'Actions',
            onExecute: () => addNotification('Creating new project...'),
        },
        {
            id: 'action-new-task',
            title: 'Create New Task',
            category: 'Actions',
            onExecute: () => addNotification('Creating new task...'),
        },
        {
            id: 'action-export',
            title: 'Export Data',
            category: 'Actions',
            onExecute: () => addNotification('Exporting data...'),
        },
        {
            id: 'action-import',
            title: 'Import Data',
            category: 'Actions',
            onExecute: () => addNotification('Importing data...'),
        },

        // Settings
        {
            id: 'settings-theme',
            title: 'Change Theme',
            category: 'Settings',
            onExecute: () => addNotification('Opening theme settings...'),
        },
        {
            id: 'settings-notifications',
            title: 'Notification Preferences',
            category: 'Settings',
            onExecute: () => addNotification('Opening notification settings...'),
        },
        {
            id: 'settings-account',
            title: 'Account Settings',
            category: 'Settings',
            onExecute: () => addNotification('Opening account settings...'),
        },

        // Help
        {
            id: 'help-docs',
            title: 'View Documentation',
            category: 'Help',
            onExecute: () => addNotification('Opening documentation...'),
        },
        {
            id: 'help-support',
            title: 'Contact Support',
            category: 'Help',
            onExecute: () => addNotification('Opening support...'),
        },
        {
            id: 'help-shortcuts',
            title: 'Keyboard Shortcuts',
            category: 'Help',
            onExecute: () => addNotification('Showing keyboard shortcuts...'),
        },
    ];

    return (
        <div className="app">
            <header className="app-header">
                <h1>Command Palette Demo</h1>
                <p className="app-subtitle">
                    Press <kbd>Cmd+K</kbd> (Mac) or <kbd>Ctrl+K</kbd> (Windows/Linux) to open the command palette
                </p>
            </header>

            <main className="app-main">
                <section className="demo-section">
                    <h2>Try It Out</h2>
                    <p>
                        This demo showcases the Command Palette component with {actions.length} available actions
                        across {new Set(actions.map(a => a.category)).size} categories.
                    </p>

                    <div className="feature-list">
                        <h3>Features:</h3>
                        <ul>
                            <li>✅ Keyboard shortcut (Cmd+K / Ctrl+K)</li>
                            <li>✅ Case-insensitive search</li>
                            <li>✅ Grouped by category</li>
                            <li>✅ Arrow key navigation with wrap-around</li>
                            <li>✅ Home/End key support</li>
                            <li>✅ Focus trap</li>
                            <li>✅ Full accessibility (ARIA)</li>
                            <li>✅ Error handling</li>
                            <li>✅ Scroll lock when open</li>
                        </ul>
                    </div>
                </section>

                <section className="demo-section">
                    <h2>Test Input Blocking</h2>
                    <p>The shortcut should NOT work when typing in these fields:</p>

                    <div className="input-group">
                        <label htmlFor="test-input">Text Input:</label>
                        <input
                            id="test-input"
                            type="text"
                            placeholder="Try Cmd+K / Ctrl+K here - it should not open the palette"
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="test-textarea">Textarea:</label>
                        <textarea
                            id="test-textarea"
                            placeholder="Try Cmd+K / Ctrl+K here - it should not open the palette"
                            rows={4}
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="test-contenteditable">ContentEditable:</label>
                        <div
                            id="test-contenteditable"
                            contentEditable
                            className="contenteditable-demo"
                        >
                            Try Cmd+K / Ctrl+K here - it should not open the palette
                        </div>
                    </div>
                </section>

                {notifications.length > 0 && (
                    <div className="notifications">
                        {notifications.map((notification, index) => (
                            <div key={index} className="notification">
                                {notification}
                            </div>
                        ))}
                    </div>
                )}
            </main>

            <CommandPalette actions={actions} />
        </div>
    );
}

export default App;
