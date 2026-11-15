import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PosBootstrap } from "@/components/pos/pos-bootstrap";
import { PosSkeleton } from "@/components/page-skeleton";
import { canAccessAdmin } from "@/lib/session";
import { getSessionUser } from "@/lib/session-server";

async function PosEntry() {
  await connection();
  const session = await getSessionUser();
  if (!session) redirect("/");
  // Only session from server — room/bill data loads in the browser for instant nav.
  return (
    <PosBootstrap
      cashierName={session.name}
      canManage={canAccessAdmin(session.role)}
    />
  );
}

export default function PosPage() {
  return (
    <Suspense fallback={<PosSkeleton />}>
      <PosEntry />
    </Suspense>
  );
}
