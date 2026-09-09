import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MMA301 GR2 PR01',
  description: 'Cross-platform application — group 2 project',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
