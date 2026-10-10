"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { canAccessPage, canViewStaffing } from "@/lib/access-policy";
import { useNavigationAccess } from "./access-provider";

export default function AccessLink({ staffing = false, ...props }: ComponentProps<typeof Link> & { staffing?: boolean }) {
  const access = useNavigationAccess();
  if (staffing && (!access || !canViewStaffing(access))) return null;
  const path = typeof props.href === "string" ? props.href : props.href.pathname;
  if (path?.startsWith("/") && path !== "/" && path !== "/login" &&
    (!access || !canAccessPage(access, path))) return null;
  return <Link {...props} prefetch={false} />;
}
