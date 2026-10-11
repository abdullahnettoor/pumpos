/**
 * The key of a mobile tab. Declared here, below the shell, so lib/ (alert
 * routing) and the shell's own tab table share it without lib importing shell.
 * Labels and Role access live in `shell/tabs.ts`.
 */
export type TabKey = 'home' | 'shifts' | 'reports' | 'money' | 'insights';
