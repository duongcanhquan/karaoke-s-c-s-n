export const productCategories = ["FOOD", "DRINK", "SERVICE"] as const;

export type ProductCategory = (typeof productCategories)[number];

export const categoryLabel: Record<ProductCategory, string> = {
  FOOD: "Đồ ăn",
  DRINK: "Đồ uống",
  SERVICE: "Dịch vụ",
};

export function isProductCategory(value: string): value is ProductCategory {
  return (productCategories as readonly string[]).includes(value);
}

export function labelCategory(value: string) {
  return isProductCategory(value) ? categoryLabel[value] : value;
}
