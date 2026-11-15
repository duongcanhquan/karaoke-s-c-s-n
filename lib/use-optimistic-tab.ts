"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Tab UI updates instantly; URL syncs in a transition so the click never freezes.
 */
export function useOptimisticTab<T extends string>(
  serverTab: T,
  hrefFor: (tab: T) => string,
) {
  const router = useRouter();
  const [tab, setTab] = useState(serverTab);
  const [synced, setSynced] = useState(serverTab);
  const [pending, startTransition] = useTransition();

  if (serverTab !== synced) {
    setSynced(serverTab);
    setTab(serverTab);
  }

  function select(next: T) {
    if (next === tab) return;
    setTab(next);
    startTransition(() => {
      router.replace(hrefFor(next), { scroll: false });
    });
  }

  return { tab, select, pending, waitingForServer: tab !== serverTab };
}
