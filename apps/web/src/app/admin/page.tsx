import type { Metadata } from "next";
import { desc, schema } from "@ssh-academy/db";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminUsersPage() {
  const users = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
      createdAt: schema.user.createdAt,
      twoFactorEnabled: schema.user.twoFactorEnabled,
    })
    .from(schema.user)
    .orderBy(desc(schema.user.createdAt))
    .limit(200);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nutzer</h1>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">E-Mail</th>
              <th className="px-4 py-2 font-medium">Rolle</th>
              <th className="px-4 py-2 font-medium">2FA</th>
              <th className="px-4 py-2 font-medium">Seit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">{u.name}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.role}</td>
                <td className="px-4 py-2">{u.twoFactorEnabled ? "ja" : "nein"}</td>
                <td className="px-4 py-2">{u.createdAt.toLocaleDateString("de-DE")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
