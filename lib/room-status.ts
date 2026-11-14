import type { RoomStatus } from "@/lib/pos-types";

export const roomStatusLabel: Record<RoomStatus, string> = {
  AVAILABLE: "Trống",
  IN_USE: "Đang hát",
  CLEANING: "Đang dọn",
};

export function labelRoomStatus(status: string) {
  return status in roomStatusLabel
    ? roomStatusLabel[status as RoomStatus]
    : status;
}
