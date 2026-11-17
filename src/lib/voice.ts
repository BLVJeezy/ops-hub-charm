// Voice for the assistant, with what the browser itself offers: speech recognition to talk to it, speech synthesis to hear
// the answer. No audio leaves the Hub's own code; the browser (or the phone) does the listening.

export type VoiceLang = "nl-BE" | "en-US";
const LANG_KEY = "hub-assistant-lang";
const SPEAK_KEY = "hub-assistant-speak";

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => recognitionClass() !== null;
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private window: the choice lasts until reload */ }
}

export function getLang(): VoiceLang {
  const v = read(LANG_KEY);
  if (v === "nl-BE" || v === "en-US") return v;
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("nl") ? "nl-BE" : "en-US";
}
export const setLang = (l: VoiceLang) => write(LANG_KEY, l);
export const getSpeak = () => read(SPEAK_KEY) !== "off";
export const setSpeak = (on: boolean) => write(SPEAK_KEY, on ? "on" : "off");

/** What went wrong with listening, in plain words. */
export function listenError(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "The microphone is blocked. Allow it for this site in your browser settings.";
  if (code === "no-speech") return "I did not hear anything. Tap the microphone and try again.";
  if (code === "audio-capture") return "No microphone found.";
  if (code === "network") return "Speech recognition needs an internet connection.";
  return "Listening stopped. Tap the microphone to try again.";
}

/**
 * Listens for one spoken question. onText gets the words so far (to show while speaking); onDone gets the final text
 * ("" if nothing was heard). Returns a function that stops listening.
 */
export function listen(lang: VoiceLang, onText: (t: string) => void, onDone: (finalText: string, error?: string) => void): () => void {
  const Rec = recognitionClass();
  if (!Rec) { onDone("", "This browser cannot listen. Use the microphone on your keyboard instead."); return () => {}; }
  const rec = new Rec();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  let heard = "";
  let error: string | undefined;
  let finished = false;
  rec.onresult = (e) => {
    heard = Array.from(e.results).map((r) => r[0].transcript).join(" ").replace(/\s+/g, " ").trim();
    onText(heard);
  };
  rec.onerror = (e) => { if (e.error !== "aborted") error = listenError(e.error); };
  rec.onend = () => { if (!finished) { finished = true; onDone(heard, heard ? undefined : error); } };
  try { rec.start(); } catch { finished = true; onDone("", listenError("")); }
  return () => { try { rec.stop(); } catch { /* already stopped */ } };
}

/** Phones only let a page speak after a tap. Call this inside the tap so the answer may be read aloud later. */
export function unlockSpeech() {
  if (!canSpeak()) return;
  try { window.speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch { /* speaking just stays off */ }
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Text as it should sound: no list dashes, links or symbols read out. */
export function forSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^[ \t]*[-•*][ \t]+/gm, "")
    .replace(/[*_#`]/g, "")
    .replace(/([.!?:])[ \t]*\n+/g, "$1 ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ", ")
    .replace(/\s+([.,])/g, "$1")
    .replace(/([.,])\1+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function speak(text: string, lang: VoiceLang, onEnd?: () => void) {
  if (!canSpeak()) return onEnd?.();
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(forSpeech(text));
  u.lang = lang;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang === lang) ?? window.speechSynthesis.getVoices().find((v) => v.lang.slice(0, 2) === lang.slice(0, 2));
  if (voice) u.voice = voice;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}
