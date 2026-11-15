export const SESSION_COOKIE = "karaoke_staff";
/** Remembers where an ADMIN last worked: quầy vs quản trị. */
export const WORK_MODE_COOKIE = "karaoke_work_mode";

export const staffRoles = ["ADMIN", "CASHIER", "SERVICE_STAFF"] as const;

export type StaffRole = (typeof staffRoles)[number];
export type WorkMode = "pos" | "admin";

export type SessionUser = {
  id: string;
  name: string;
  role: StaffRole;
};

export const roleLabel: Record<StaffRole, string> = {
  ADMIN: "Quản lý",
  CASHIER: "Thu ngân",
  SERVICE_STAFF: "Nhân viên phục vụ",
};

export function isStaffRole(value: string): value is StaffRole {
  return (staffRoles as readonly string[]).includes(value);
}

export function canAccessAdmin(role: StaffRole) {
  return role === "ADMIN";
}

/** Quản lý cũng làm thu ngân được — POS luôn mở cho mọi role đã đăng nhập. */
export function canAccessPos(role: StaffRole) {
  void role;
  return true;
}

export function isWorkMode(value: string | undefined | null): value is WorkMode {
  return value === "pos" || value === "admin";
}

export function homeForRole(role: StaffRole, preferredMode?: WorkMode | null) {
  if (role === "ADMIN") {
    return preferredMode === "pos" ? "/pos" : "/admin";
  }
  return "/pos";
}

export function resolveLoginDestination(
  role: StaffRole,
  destination: string | undefined | null,
  preferredMode?: WorkMode | null,
) {
  const asked = isWorkMode(destination) ? destination : null;
  if (asked === "admin") {
    if (!canAccessAdmin(role)) {
      return { ok: false as const, error: "Tài khoản này không vào được quản lý. Dùng Quầy bán hàng." };
    }
    return { ok: true as const, path: "/admin", mode: "admin" as WorkMode };
  }
  if (asked === "pos") {
    return { ok: true as const, path: "/pos", mode: "pos" as WorkMode };
  }
  const mode: WorkMode =
    role === "ADMIN" ? (preferredMode === "pos" ? "pos" : "admin") : "pos";
  return { ok: true as const, path: homeForRole(role, mode), mode };
}

export function encodeSession(user: SessionUser) {
  return encodeURIComponent(JSON.stringify(user));
}

export function decodeSession(value: string | undefined | null): SessionUser | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<SessionUser>;
    if (!parsed.id || !parsed.name || !parsed.role || !isStaffRole(parsed.role)) return null;
    return { id: parsed.id, name: parsed.name, role: parsed.role };
  } catch {
    return null;
  }
}
