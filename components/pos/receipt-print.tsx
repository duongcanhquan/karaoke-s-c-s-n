"use client";

import { formatVnd } from "@/lib/money";
import {
  defaultReceiptShopInfo,
  loadPrinterPrefsLocal,
  type ReceiptShopInfo,
} from "@/lib/printer-prefs";
import type { PaymentCheckout, PaymentMethod } from "@/lib/pos-types";
import { vietQrImageUrl } from "@/lib/vietqr";

function shopInfoFromPayment(payment: PaymentCheckout): ReceiptShopInfo {
  return {
    shopName: payment.shopName || defaultReceiptShopInfo.shopName,
    shopAddress: payment.shopAddress || "",
    shopPhone: payment.shopPhone || "",
    receiptFooter: payment.receiptFooter || defaultReceiptShopInfo.receiptFooter,
    printerPaperMm: payment.printerPaperMm === 58 ? 58 : 80,
    printerAutoPrint: Boolean(payment.printerAutoPrint),
    printerCopies: Math.min(3, Math.max(1, payment.printerCopies || 1)),
    printerName: payment.printerName || "",
  };
}

export function resolveReceiptShopInfo(payment?: PaymentCheckout | null): ReceiptShopInfo {
  const local = typeof window !== "undefined" ? loadPrinterPrefsLocal() : null;
  if (payment) {
    const fromPay = shopInfoFromPayment(payment);
    // Prefer server payment payload; fill gaps from local cache.
    return {
      ...fromPay,
      shopName: fromPay.shopName || local?.shopName || defaultReceiptShopInfo.shopName,
      shopAddress: fromPay.shopAddress || local?.shopAddress || "",
      shopPhone: fromPay.shopPhone || local?.shopPhone || "",
      receiptFooter:
        fromPay.receiptFooter || local?.receiptFooter || defaultReceiptShopInfo.receiptFooter,
      printerPaperMm: fromPay.printerPaperMm || local?.printerPaperMm || 80,
      printerAutoPrint: fromPay.printerAutoPrint || Boolean(local?.printerAutoPrint),
      printerCopies: fromPay.printerCopies || local?.printerCopies || 1,
      printerName: fromPay.printerName || local?.printerName || "",
    };
  }
  return local ?? defaultReceiptShopInfo;
}

export function printReceipt(input: {
  payment: PaymentCheckout;
  method: PaymentMethod;
  cashAmount: number;
  transferAmount: number;
  cashierName: string;
  copies?: number;
}) {
  const { payment, method, cashAmount, transferAmount, cashierName } = input;
  const shop = resolveReceiptShopInfo(payment);
  const copies = Math.min(3, Math.max(1, input.copies ?? shop.printerCopies));
  const paper = shop.printerPaperMm;
  const bodyWidth = paper === 58 ? "54mm" : "72mm";
  const pageSize = paper === 58 ? "58mm auto" : "80mm auto";
  const qrSize = paper === 58 ? "40mm" : "48mm";

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

  const addressBlock = [
    shop.shopAddress ? `<div class="muted">${escapeHtml(shop.shopAddress)}</div>` : "",
    shop.shopPhone ? `<div class="muted">ĐT: ${escapeHtml(shop.shopPhone)}</div>` : "",
  ].join("");

  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Hóa đơn ${escapeHtml(payment.roomName)}</title>
  <style>
    @page { size: ${pageSize}; margin: 3mm; }
    body { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: #000; width: ${bodyWidth}; margin: 0 auto; }
    h1 { font-size: 15px; margin: 0 0 4px; text-align: center; text-transform: uppercase; }
    .muted { color: #333; font-size: 11px; text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 3px 0; vertical-align: top; }
    th { border-bottom: 1px dashed #000; text-align: left; }
    .num { text-align: right; white-space: nowrap; }
    .total { font-size: 14px; font-weight: 700; margin-top: 8px; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
    img.qr { display: block; width: ${qrSize}; height: ${qrSize}; margin: 8px auto; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    @media print {
      body { width: ${bodyWidth}; }
      .page-break { page-break-after: always; }
    }
  </style>
</head>
<body>
  ${Array.from({ length: copies }, () => `
  <section>
  <h1>${escapeHtml(shop.shopName)}</h1>
  ${addressBlock}
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
  <div class="muted">${escapeHtml(shop.receiptFooter)}</div>
  ${shop.printerName ? `<div class="muted">Máy in: ${escapeHtml(shop.printerName)}</div>` : ""}
  </section>
  `).join('<div class="page-break"></div>')}
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };</script>
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

/** Sample slip to verify Windows printer / paper size. */
export function printTestReceipt(shop?: ReceiptShopInfo) {
  const info = shop ?? resolveReceiptShopInfo(null);
  const fakePayment: PaymentCheckout = {
    invoiceId: "test",
    roomName: "P.TEST",
    roomType: "VIP",
    startTime: new Date().toISOString(),
    hourlyRate: 100000,
    billableHours: 1,
    roomTotal: 100000,
    itemsTotal: 25000,
    staffTotal: 0,
    grandTotal: 125000,
    lines: [
      { productId: "1", name: "Nước suối", qty: 1, price: 15000, amount: 15000, canReduce: false },
      { productId: "2", name: "Bia", qty: 1, price: 10000, amount: 10000, canReduce: false },
    ],
    bankBin: "",
    bankAccountNumber: "",
    bankAccountName: "",
    ...info,
  };
  printReceipt({
    payment: fakePayment,
    method: "CASH",
    cashAmount: fakePayment.grandTotal,
    transferAmount: 0,
    cashierName: "Kiểm tra in",
    copies: 1,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
