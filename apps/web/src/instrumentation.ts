export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Hintergrundaufgaben nur im Server-Prozess, nicht beim Build
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startPocketIdSync } = await import("./lib/pocket-id-sync");
  startPocketIdSync();
}
