export const env = {
  apiUrl: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001',
  signalingUrl: process.env['NEXT_PUBLIC_SIGNALING_URL'] ?? 'http://localhost:3002',
} as const;
