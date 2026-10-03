/**
 * SSH-Gateway der SSH-Academy.
 * - interne HTTP-API für die Web-App (Host-Key prüfen, Befehle ausführen, Zertifikate ausstellen)
 * - WebSocket für Web-Terminal und SFTP im Browser
 * Nur das Gateway kann Tresor-Keys entschlüsseln.
 */
import { createServer } from "node:http";
import { config } from "./config";
import { handleHttp } from "./http";
import { closeStaleSessions, handleUpgrade } from "./sessions";
import { loadVault } from "./vault";

await loadVault();
await closeStaleSessions();

const server = createServer((req, res) => void handleHttp(req, res));
server.on("upgrade", handleUpgrade);
server.listen(config.port, () => {
  console.log(`[gateway] läuft auf Port ${config.port}`);
  if (config.allowedNetworks.length) console.log(`[gateway] freigegebene Netze: ${process.env.SSH_ALLOWED_NETWORKS}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`[gateway] ${signal} empfangen, beende ...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
