import { useSyncExternalStore } from "react";

// Whether the assistant is open. Lives outside React so any button (the phone's bottom bar, the desktop button) can summon it.
let open = false;
const listeners = new Set<() => void>();

export function setAssistantOpen(next: boolean) {
  if (next === open) return;
  open = next;
  listeners.forEach((l) => l());
}

export function useAssistantOpen(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => open,
    () => false,
  );
}
