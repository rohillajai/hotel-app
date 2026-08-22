import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/context/auth-context';

export const metadata: Metadata = { title: 'Hotel Staff', manifest: '/manifest.json' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#059669' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, sans-serif', background: '#f9fafb' }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
