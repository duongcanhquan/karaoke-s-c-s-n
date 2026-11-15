import { updateTag } from "next/cache";

/** Bust cached admin/POS reads after mutations (read-your-own-writes). */
export function bustProductsCache() {
  updateTag("products");
  updateTag("inventory");
}

export function bustRoomsCache() {
  updateTag("rooms");
  updateTag("minibar");
  updateTag("pos");
}

export function bustMinibarCache() {
  updateTag("minibar");
  updateTag("rooms");
}

export function bustInventoryCache() {
  updateTag("inventory");
  updateTag("products");
}

export function bustPosCache() {
  updateTag("pos");
  updateTag("rooms");
}
