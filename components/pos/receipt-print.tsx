"use client";

import { formatVnd } from "@/lib/money";
import type { PaymentCheckout, PaymentMethod } from "@/lib/pos-types";
import { vietQrImageUrl } from "@/lib/vietqr";

export function printReceipt(input: {
  payment: PaymentCheckout;
  method: PaymentMethod;
  cashAmount: number;
  transferAmount: number;
  cashierName: string;
}) {
  const { payment, method, cashAmount, transferAmount, cashierName } = input;
  const when = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
    hourCycle: "h23",
  }).format(new Date());
  const methodLabel =
    method === "CASH" ? "Tiền mặt" : method === "QR" ? "Chuyển khoản QR" : "Tiền mặt + QR";
  const showQr = transferAmount > 0 && payment.bankAccountNumber && payment.bankBin;
  const qrSrc = showQr ? vietQrImageUrl(payment, transferAmount) : "";

  const linesHtml = payment.lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.name)}</td>
        <td class="num">${line.qty}</td>
        <td class="num">${formatVnd(line.amount)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Hóa đơn ${escapeHtml(payment.roomName)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: #000; width: 72mm; margin: 0 auto; }
    h1 { font-size: 16px; margin: 0 0 4px; text-align: center; }
    h2 { font-size: 13px; margin: 8px 0 4px; text-align: center; }
    .muted { color: #333; font-size: 11px; text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 3px 0; vertical-align: top; }
    th { border-bottom: 1px dashed #000; text-align: left; }
    .num { text-align: right; white-space: nowrap; }
    .total { font-size: 15px; font-weight: 700; margin-top: 8px; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
    img.qr { display: block; width: 48mm; height: 48mm; margin: 8px auto; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    @media print { body { width: 72mm; } }
  </style>
</head>
<body>
  <h1>KARAOKE</h1>
  <div class="muted">Hóa đơn thanh toán</div>
  <div class="muted">${escapeHtml(when)}</div>
  <hr />
  <div class="row"><span>Phòng</span><strong>${escapeHtml(payment.roomName)}</strong></div>
  <div class="row"><span>Loại</span><span>${escapeHtml(payment.roomType)}</span></div>
  <div class="row"><span>Thu ngân</span><span>${escapeHtml(cashierName)}</span></div>
  <div class="row"><span>Giờ tính</span><span>${payment.billableHours} giờ</span></div>
  <div class="row"><span>Tiền hát</span><span>${formatVnd(payment.roomTotal)}</span></div>
  <hr />
  <table>
    <thead><tr><th>Món</th><th class="num">SL</th><th class="num">Tiền</th></tr></thead>
    <tbody>${linesHtml || `<tr><td colspan="3">Không có món</td></tr>`}</tbody>
  </table>
  <hr />
  <div class="row"><span>Đồ dùng</span><span>${formatVnd(payment.itemsTotal)}</span></div>
  ${payment.staffTotal > 0 ? `<div class="row"><span>Phục vụ</span><span>${formatVnd(payment.staffTotal)}</span></div>` : ""}
  <div class="row total"><span>TỔNG</span><span>${formatVnd(payment.grandTotal)}</span></div>
  <div class="row"><span>Hình thức</span><span>${methodLabel}</span></div>
  ${cashAmount > 0 ? `<div class="row"><span>Tiền mặt</span><span>${formatVnd(cashAmount)}</span></div>` : ""}
  ${transferAmount > 0 ? `<div class="row"><span>Chuyển khoản</span><span>${formatVnd(transferAmount)}</span></div>` : ""}
  ${
    showQr
      ? `<hr /><div class="muted">${escapeHtml(payment.bankAccountName)} · ${escapeHtml(payment.bankAccountNumber)}</div>
         <img class="qr" src="${qrSrc}" alt="VietQR" />`
      : ""
  }
  <hr />
  <div class="muted">Cảm ơn quý khách</div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 400); };</script>
</body>
</html>`;

  const popup = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
  if (!popup) {
    throw new Error("Trình duyệt chặn cửa sổ in. Cho phép popup rồi thử lại.");
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
