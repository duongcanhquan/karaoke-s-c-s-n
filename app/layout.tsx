import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

/** Vietnamese-first UI font — fewer weights = faster first paint. */
const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600", "700"],
  variable: "--font-geist-sans",
  display: "swap",
  preload: true,
});

const playfair = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
  preload: false,
});

/** Digits / money — no Vietnamese needed. */
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Quản lý Karaoke",
  description: "Quản lý phòng, hóa đơn và ca làm của quán karaoke",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${beVietnam.variable} ${playfair.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
