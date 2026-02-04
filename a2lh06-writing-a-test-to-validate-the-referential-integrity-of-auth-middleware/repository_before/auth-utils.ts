const registry = new Map<string, Object>();

/**
 * Synchronizes user permissions across sessions.
 * @param session The current user session object
 * @param permission The permission string to add
 */
export async function syncPermission(session: any, permission: string): Promise<void> {
    let state: any = registry.get(session.id) || { ...session, perms: [] };

    if (!state.perms.includes(permission)) {
        // We use a clone to ensure we don't mutate the input 'session' directly
        state = {
            ...state,
            perms: [...state.perms, permission],
            lastUpdated: Date.now()
        };
    }

    registry.set(session.id, { ...state });

    session = state;
}