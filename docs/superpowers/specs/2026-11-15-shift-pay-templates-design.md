# Thiết kế: Mẫu ca & lương linh hoạt

Ngày: 2026-11-15  
Trạng thái: Đã duyệt (hướng 1 + dữ liệu OK; triển khai theo yêu cầu “làm đi”)

## Mục tiêu

- Cấu hình **mẫu ca** (tên, giờ bắt đầu–kết thúc, kể cả qua đêm).
- Mỗi mẫu ca chọn **theo giờ** hoặc **cố định/ca**, kèm mức mặc định.
- Nhân viên: **theo ca** *hoặc* **lương tháng** (không trộn).
- Lương tháng: tùy chọn **cần chấm công** (điểm danh, không cộng tiền theo ca).
- Có thể **ghi đè mức tiền** theo (nhân viên × mẫu ca).

## Dữ liệu

### `shift_templates`

| Cột | Ý nghĩa |
|-----|---------|
| name | Tên ca |
| start_time / end_time | `time` trong ngày; end ≤ start = qua đêm |
| pay_mode | `HOURLY` \| `FIXED` |
| default_amount | Đơn giá/giờ hoặc tiền/ca |
| is_active | Ẩn mẫu cũ |

### `users` (bổ sung)

- `pay_type`: `SHIFT` \| `MONTHLY` (mặc định `SHIFT`)
- `monthly_salary` ≥ 0
- `require_clock_in` boolean (chỉ có ý nghĩa khi MONTHLY)

### `staff_shift_rates`

- Unique `(user_id, template_id)` → `amount` ghi đè mức mẫu ca (giữ `pay_mode` của mẫu).

### `shifts` (bổ sung)

- `template_id` nullable
- `pay_mode`: `HOURLY` \| `FIXED` \| `ATTENDANCE`
- `hourly_salary` giữ làm snapshot **rate** (tương thích cũ)

**Ra ca:** HOURLY = giờ × rate; FIXED = rate; ATTENDANCE = 0.

## UI (HR)

- Tab **Ca làm**: cấu hình mẫu ca + vào ca (chọn NV + mẫu ca) + lịch sử.
- Tab **Nhân viên**: chế độ lương; MONTHLY → mức tháng + chấm công; SHIFT → mức theo mẫu ca (sửa).
- Tab **Lương**: cộng `shiftPay` + `monthlyPay` + `bookingPay`.

## Ngoài phạm vi

- Roster xếp ca theo ngày trước.
- Trạng thái đã trả lương / phiếu lương.
