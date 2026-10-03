import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { authErrorMessage } from "@/lib/auth-errors";
import { getPublicAuthConfig } from "@/lib/public-config";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Anmelden" };

function safeRedirect(target: string | undefined) {
  return target && target.startsWith("/") && !target.startsWith("//") ? target : "/dashboard";
}

export default async function LoginPage({ searchParams }: PageProps<"/anmelden">) {
  const params = await searchParams;
  const next = safeRedirect(typeof params.weiter === "string" ? params.weiter : undefined);
  if (await getSession()) redirect(next);

  const error = authErrorMessage(typeof params.error === "string" ? params.error : null);
  return <LoginForm config={getPublicAuthConfig()} next={next} initialError={error} />;
}
