export interface Action {
    id: string;
    title: string;
    category: string;
    onExecute: () => void | Promise<void>;
}

export interface CommandPaletteProps {
    actions: Action[];
}
