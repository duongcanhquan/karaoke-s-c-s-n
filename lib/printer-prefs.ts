"use client";

export type PrinterPaperMm = 58 | 80;

export type ReceiptShopInfo = {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  receiptFooter: string;
  printerPaperMm: PrinterPaperMm;
  printerAutoPrint: boolean;
  printerCopies: number;
  printerName: string;
};

const STORAGE_KEY = "karaoke-printer-prefs-v1";

export const defaultReceiptShopInfo: ReceiptShopInfo = {
  shopName: "Karaoke",
  shopAddress: "",
  shopPhone: "",
  receiptFooter: "Cảm ơn quý khách",
  printerPaperMm: 80,
  printerAutoPrint: false,
  printerCopies: 1,
  printerName: "",
};

export function savePrinterPrefsLocal(info: ReceiptShopInfo) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  } catch {
    // ignore quota / private mode
  }
}

export function loadPrinterPrefsLocal(): ReceiptShopInfo | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReceiptShopInfo>;
    return {
      ...defaultReceiptShopInfo,
      ...parsed,
      printerPaperMm: parsed.printerPaperMm === 58 ? 58 : 80,
      printerCopies: Math.min(3, Math.max(1, Number(parsed.printerCopies) || 1)),
      printerAutoPrint: Boolean(parsed.printerAutoPrint),
    };
  } catch {
    return null;
  }
}
