export const stockKinds = ["CONSUMABLE", "REUSABLE"] as const;

export type StockKind = (typeof stockKinds)[number];

export const stockKindLabel: Record<StockKind, string> = {
  CONSUMABLE: "Tiêu hao (trừ kho khi bán)",
  REUSABLE: "Sử dụng lại (không trừ kho khi bán)",
};

export function isStockKind(value: string): value is StockKind {
  return (stockKinds as readonly string[]).includes(value);
}

export function labelStockKind(value: string) {
  return isStockKind(value) ? stockKindLabel[value] : value;
}

/** Default unit names when inventory_units table is empty / not migrated. */
export const defaultInventoryUnits = [
  "cái",
  "chiếc",
  "chai",
  "lon",
  "ly",
  "đĩa",
  "hộp",
  "thùng",
  "bộ",
  "kg",
] as const;
