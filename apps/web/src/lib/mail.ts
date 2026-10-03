import "server-only";
import nodemailer from "nodemailer";
import { env } from "./env";

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    // Ohne SMTP-Konfiguration (lokale Entwicklung) landen Mails im Log.
    console.info(`[mail] an ${to}: ${subject}\n${text}`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
}
