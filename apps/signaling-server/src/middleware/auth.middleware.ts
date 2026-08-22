import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

export interface SocketUser {
  sub: string;
  tenant_id: string;
  entity_type: string;
  room?: string;
  grants: string[];
}

/**
 * Socket.IO auth middleware — validates JWT from handshake.
 * Token is passed as socket.handshake.auth.token or query param.
 *
 * On success: attaches decoded payload to socket.user
 * On failure: disconnects with error event
 */
export function authMiddleware(
  socket: Socket,
  secret: string,
  next: (err?: Error) => void,
): void {
  const token =
    ((socket.handshake.auth as Record<string, unknown>)?.['token'] as string) ??
    (socket.handshake.query?.['token'] as string) ??
    '';

  if (!token) {
    return next(new Error('Authentication required. Provide JWT in handshake auth.token'));
  }

  try {
    const decoded = jwt.verify(token, secret) as SocketUser;

    if (!decoded.sub || !decoded.tenant_id || !decoded.entity_type) {
      return next(new Error('Malformed token payload.'));
    }

    (socket as any).user = decoded;
    next();
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? 'Token expired. Re-authenticate.'
        : 'Invalid token.';
    next(new Error(message));
  }
}
