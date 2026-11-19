import type { EditorEngine } from './EditorEngine';

let activeEngine: EditorEngine | null = null;

export function setActiveEngine(engine: EditorEngine | null): void {
  activeEngine = engine;
}

export function getActiveEngine(): EditorEngine | null {
  return activeEngine;
}
