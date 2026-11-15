import type { PaymentCheckout } from "@/lib/pos-types";

export function vietQrImageUrl(payment: PaymentCheckout, amount = payment.grandTotal) {
  const rounded = Math.round(Math.max(0, amount));
  const addInfo = `Thanh toan ${payment.roomName} Bill ${payment.invoiceId}`;
  const params = new URLSearchParams({
    amount: String(rounded),
    addInfo,
    accountName: payment.bankAccountName,
  });
  return `https://img.vietqr.io/image/${payment.bankBin}-${payment.bankAccountNumber}-compact2.png?${params.toString()}`;
}
