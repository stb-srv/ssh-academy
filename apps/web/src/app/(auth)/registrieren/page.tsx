import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { schema } from "@ssh-academy/db";
import { RegisterForm } from "@/components/auth/register-form";
import { Alert } from "@/components/ui/alert";
import { db } from "@/lib/db";
import { getPublicAuthConfig } from "@/lib/public-config";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Registrieren" };

export default async function RegisterPage() {
  if (await getSession()) redirect("/dashboard");
  const config = getPublicAuthConfig();
  const isFirstUser = (await db.select({ id: schema.user.id }).from(schema.user).limit(1)).length === 0;

  if (!config.localLogin || (!config.registrationOpen && !isFirstUser)) {
    return (
      <Alert>
        Die Registrierung ist auf dieser Plattform geschlossen.
        {config.pocketId && ` Melde dich stattdessen mit ${config.pocketId.name} an.`}
      </Alert>
    );
  }
  return <RegisterForm isFirstUser={isFirstUser} />;
}
