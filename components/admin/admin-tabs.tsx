"use client";

import type { ComponentProps } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminTabsListClass, adminTabTriggerClass } from "@/lib/admin-ui";
import { cn } from "cn";

export function AdminTabsList({
  className,
  ...props
}: ComponentProps<typeof TabsList>) {
  return (
    <TabsList className={cn(adminTabsListClass, className)} {...props} />
  );
}

export function AdminTabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger className={cn(adminTabTriggerClass, className)} {...props} />
  );
}
