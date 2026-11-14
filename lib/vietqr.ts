import type { PaymentCheckout } from "@/lib/pos-types";

export function vietQrImageUrl(payment: PaymentCheckout) {
  const amount = Math.round(payment.grandTotal);
  const addInfo = `Thanh toan ${payment.roomName} Bill ${payment.invoiceId}`;
  const params = new URLSearchParams({
    amount: String(amount),
    addInfo,
    accountName: payment.bankAccountName,
  });
  return `https://img.vietqr.io/image/${payment.bankBin}-${payment.bankAccountNumber}-compact2.png?${params.toString()}`;
}
