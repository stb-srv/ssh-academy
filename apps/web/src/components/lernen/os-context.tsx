"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type OsName = "linux" | "macos" | "windows";
export const OS_LABELS: Record<OsName, string> = { linux: "Linux", macos: "macOS", windows: "Windows" };

const STORAGE_KEY = "ssh-academy-os";
const OsContext = createContext<{ os: OsName; setOs: (os: OsName) => void }>({
  os: "linux",
  setOs: () => {},
});

function detectOs(): OsName {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  return "linux";
}

/** Merkt sich das Betriebssystem des Lernenden, damit alle Befehle passend angezeigt werden */
export function OsProvider({ children }: { children: ReactNode }) {
  const [os, setOsState] = useState<OsName>("linux");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Browserwerte gibt es erst nach dem Hydrieren
    setOsState(stored === "linux" || stored === "macos" || stored === "windows" ? stored : detectOs());
  }, []);

  function setOs(next: OsName) {
    setOsState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }

  return <OsContext.Provider value={{ os, setOs }}>{children}</OsContext.Provider>;
}

export function useOs() {
  return useContext(OsContext);
}
