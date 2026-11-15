/** Common VN bank BIN codes for VietQR. */
export const vietnamBanks = [
  { bin: "970436", name: "Vietcombank" },
  { bin: "970415", name: "VietinBank" },
  { bin: "970418", name: "BIDV" },
  { bin: "970405", name: "Agribank" },
  { bin: "970422", name: "MB Bank" },
  { bin: "970407", name: "Techcombank" },
  { bin: "970432", name: "VPBank" },
  { bin: "970423", name: "TPBank" },
  { bin: "970403", name: "Sacombank" },
  { bin: "970416", name: "ACB" },
  { bin: "970448", name: "OCB" },
  { bin: "970437", name: "HDBank" },
  { bin: "970441", name: "VIB" },
  { bin: "970443", name: "SHB" },
  { bin: "970454", name: "VietCapitalBank" },
] as const;

export function bankNameForBin(bin: string) {
  return vietnamBanks.find((bank) => bank.bin === bin)?.name ?? "Ngân hàng";
}
