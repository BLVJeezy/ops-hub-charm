// "Cijfers verbergen": blur amounts and numbers so the Hub can be shown to someone else.
// The choice is remembered on this device. Works by a class on <html> (see styles.css)
// plus a marker class on every element whose own text contains an amount.
import { useSyncExternalStore } from "react";

const KEY = "solyn_privacy";
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

/** Text that shows money: €, $, or a decimal amount like 1.234,56. */
export const MONEY_RE = /[€$]\s?-?\d|-?\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+,\d{2}\b/;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function isPrivate(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("privacy");
}

function markMoney(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (el && !el.classList.contains("money") && MONEY_RE.test(n.nodeValue ?? ""))
      el.classList.add("money");
  }
}

function apply(on: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("privacy", on);
  if (on) {
    markMoney(document.body);
    if (!observer) {
      observer = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === "characterData") {
            if (m.target.parentElement && MONEY_RE.test(m.target.nodeValue ?? ""))
              m.target.parentElement.classList.add("money");
          } else m.addedNodes.forEach((a) => markMoney(a));
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  } else if (observer) {
    observer.disconnect();
    observer = null;
  }
}

export function setPrivacy(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  apply(on);
  listeners.forEach((l) => l());
}

export function togglePrivacy() {
  setPrivacy(!isPrivate());
}

/** Call once on app start. */
export function initPrivacy() {
  apply(read());
}

export function usePrivacy(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => isPrivate(),
    () => false,
  );
}
