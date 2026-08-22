import type { Metadata } from 'next';
import { AuthProvider } from '@/context/auth-context';

export const metadata: Metadata = { title: 'Hotel Admin Dashboard' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, sans-serif', background: '#f3f4f6' }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
