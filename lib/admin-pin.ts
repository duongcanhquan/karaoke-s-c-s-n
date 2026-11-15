import { createClient } from "@/utils/supabase/server";

/** Verify manager PIN against users.role = ADMIN. */
export async function checkAdminPin(
  pinCode: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pin = String(pinCode ?? "").trim();
  if (!pin) return { ok: false, error: "Nhập mã PIN quản lý." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("pin_code", pin)
    .eq("role", "ADMIN")
    .limit(1);

  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Sai mã PIN quản lý." };
  return { ok: true };
}
