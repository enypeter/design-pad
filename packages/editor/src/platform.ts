export const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Display name of the primary modifier key. */
export const mod = isMac ? '⌘' : 'Ctrl';
