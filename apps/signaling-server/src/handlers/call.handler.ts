import type { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { DepartmentRoundRobinStrategy } from '@hotel-app/core';
import type { SignalingConfig } from '@hotel-app/config';
import { PresenceManager } from '../services/presence.manager';
import { RateLimiter } from '../services/rate-limiter';
import type { SocketUser } from '../middleware/auth.middleware';

interface CallState {
  callId: string;
  callerSocketId: string;
  callerIdentityId: string;
  calleeSocketId?: string;
  calleeIdentityId?: string;
  calleeDept: string;
  tenantId: string;
  roomIdentifier: string;
  initiatedAt: Date;
  answeredAt?: Date;
}

/**
 * CallHandler — orchestrates the call lifecycle on the signaling server.
 *
 * Responsibilities:
 *   1. Validate caller's grant (ACTIVE + not calling_restricted)
 *   2. Rate-limit calls per subject
 *   3. Route call to an available staff member (round-robin)
 *   4. Relay SDP/ICE between peers (signaling only — no audio proxying)
 *   5. Log call metadata to API server on completion
 */
export class CallHandler {
  private readonly activeCalls = new Map<string, CallState>();
  private readonly routingStrategy: DepartmentRoundRobinStrategy;

  constructor(
    private readonly io: Server,
    private readonly presence: PresenceManager,
    private readonly rateLimiter: RateLimiter,
    private readonly config: SignalingConfig,
  ) {
    this.routingStrategy = new DepartmentRoundRobinStrategy(presence);
  }

  // ─── call:initiate ─────────────────────────────────────────────────────────

  async handleInitiate(
    socket: Socket,
    user: SocketUser,
    data: { to_dept: string; call_id?: string },
  ): Promise<void> {
    const callId = data.call_id ?? randomUUID();

    // 1. Verify grant is active and calling not restricted
    const privCheck = await this.checkPrivilege(user.sub, 'CALLING');
    if (!privCheck.allowed) {
      socket.emit('call:error', { call_id: callId, code: 'NO_ACTIVE_GRANT', message: 'No active grant.' });
      return;
    }
    if (privCheck.callingRestricted) {
      socket.emit('call:error', { call_id: callId, code: 'CALLING_RESTRICTED', message: 'Calling is restricted on your account.' });
      return;
    }

    // 2. Rate limit
    const rateResult = await this.rateLimiter.checkCallRate(user.sub);
    if (!rateResult.allowed) {
      socket.emit('call:error', {
        call_id: callId,
        code: 'RATE_LIMITED',
        message: `Too many calls. Try again in ${rateResult.retryAfter} seconds.`,
      });
      return;
    }

    // 3. Route to available staff
    const route = await this.routingStrategy.route({
      tenantId: user.tenant_id,
      callerIdentityId: user.sub,
      toDepartment: data.to_dept,
    });

    if (!route) {
      socket.emit('call:error', {
        call_id: callId,
        code: 'NO_STAFF_AVAILABLE',
        message: 'All staff are busy. Please try again.',
      });
      return;
    }

    // 4. Store call state
    const callState: CallState = {
      callId,
      callerSocketId: socket.id,
      callerIdentityId: user.sub,
      calleeSocketId: route.calleeSocketId,
      calleeIdentityId: route.calleeIdentityId,
      calleeDept: route.calleeDepartment,
      tenantId: user.tenant_id,
      roomIdentifier: user.room ?? 'Unknown',
      initiatedAt: new Date(),
    };
    this.activeCalls.set(callId, callState);

    // 5. Emit incoming call to staff
    this.io.to(route.calleeSocketId).emit('call:incoming', {
      call_id: callId,
      from_room: user.room ?? 'Unknown',
      dept: data.to_dept,
    });

    // Log initiation (fire-and-forget to API server)
    this.logCallMetadata(callState, 'INITIATED').catch(() => {});
  }

  // ─── call:accept ───────────────────────────────────────────────────────────

  handleAccept(
    socket: Socket,
    user: SocketUser,
    data: { call_id: string },
  ): void {
    const call = this.activeCalls.get(data.call_id);
    if (!call || call.calleeSocketId !== socket.id) return;

    call.answeredAt = new Date();
    call.calleeIdentityId = user.sub;

    // Notify caller that the call was accepted
    this.io.to(call.callerSocketId).emit('call:accepted', {
      call_id: data.call_id,
      peer_socket_id: socket.id,
    });

    // Notify callee with caller's socket ID for SDP exchange
    socket.emit('call:accepted', {
      call_id: data.call_id,
      peer_socket_id: call.callerSocketId,
    });
  }

  // ─── call:reject ───────────────────────────────────────────────────────────

  handleReject(
    socket: Socket,
    _user: SocketUser,
    data: { call_id: string },
  ): void {
    const call = this.activeCalls.get(data.call_id);
    if (!call || call.calleeSocketId !== socket.id) return;

    this.io.to(call.callerSocketId).emit('call:rejected', {
      call_id: data.call_id,
    });

    this.endCall(data.call_id, 'REJECTED');
  }

  // ─── call:ice-candidate ────────────────────────────────────────────────────

  handleIceCandidate(
    socket: Socket,
    data: { call_id: string; candidate: unknown },
  ): void {
    const call = this.activeCalls.get(data.call_id);
    if (!call) return;

    // Relay to the other peer
    const targetSocket =
      socket.id === call.callerSocketId
        ? call.calleeSocketId
        : call.callerSocketId;

    if (targetSocket) {
      this.io.to(targetSocket).emit('call:ice-candidate', {
        call_id: data.call_id,
        candidate: data.candidate,
      });
    }
  }

  // ─── call:sdp ──────────────────────────────────────────────────────────────

  handleSdp(
    socket: Socket,
    data: { call_id: string; sdp: unknown },
  ): void {
    const call = this.activeCalls.get(data.call_id);
    if (!call) return;

    // Relay to the other peer
    const targetSocket =
      socket.id === call.callerSocketId
        ? call.calleeSocketId
        : call.callerSocketId;

    if (targetSocket) {
      this.io.to(targetSocket).emit('call:sdp', {
        call_id: data.call_id,
        sdp: data.sdp,
      });
    }
  }

  // ─── call:end ──────────────────────────────────────────────────────────────

  handleEnd(
    socket: Socket,
    _user: SocketUser,
    data: { call_id: string },
  ): void {
    const call = this.activeCalls.get(data.call_id);
    if (!call) return;

    // Notify the other peer
    const otherSocket =
      socket.id === call.callerSocketId
        ? call.calleeSocketId
        : call.callerSocketId;

    if (otherSocket) {
      this.io.to(otherSocket).emit('call:ended', { call_id: data.call_id });
    }

    this.endCall(data.call_id, call.answeredAt ? 'ANSWERED' : 'MISSED');
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private endCall(callId: string, outcome: string): void {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    this.activeCalls.delete(callId);

    // Log completion
    this.logCallMetadata(call, outcome).catch(() => {});
  }

  private async checkPrivilege(
    subjectId: string,
    privilege: string,
  ): Promise<{ allowed: boolean; callingRestricted: boolean }> {
    try {
      const response = await axios.get(
        `${this.config.API_SERVER_URL}/api/v1/grants/subject/${subjectId}`,
        {
          headers: {
            ...(this.config.SIGNALING_INTERNAL_SECRET
              ? { 'X-Internal-Secret': this.config.SIGNALING_INTERNAL_SECRET }
              : {}),
          },
          timeout: 3000,
        },
      );

      const grant = response.data;
      if (!grant || grant.status !== 'ACTIVE') {
        return { allowed: false, callingRestricted: false };
      }

      return {
        allowed: Array.isArray(grant.privileges) && grant.privileges.includes(privilege),
        callingRestricted: grant.callingRestricted ?? false,
      };
    } catch {
      // If API is unreachable, deny by default (fail-closed)
      return { allowed: false, callingRestricted: false };
    }
  }

  private async logCallMetadata(call: CallState, outcome: string): Promise<void> {
    const endedAt = new Date();
    const durationSecs = call.answeredAt
      ? Math.floor((endedAt.getTime() - call.answeredAt.getTime()) / 1000)
      : 0;

    try {
      await axios.post(
        `${this.config.API_SERVER_URL}/api/v1/internal/call-logs`,
        {
          tenant_id: call.tenantId,
          caller_id: call.callerIdentityId,
          callee_dept: call.calleeDept,
          callee_id: call.calleeIdentityId ?? null,
          room_identifier: call.roomIdentifier,
          call_id: call.callId,
          initiated_at: call.initiatedAt.toISOString(),
          answered_at: call.answeredAt?.toISOString() ?? null,
          ended_at: endedAt.toISOString(),
          duration_secs: durationSecs,
          outcome,
          turn_relayed: false,
        },
        {
          headers: {
            ...(this.config.SIGNALING_INTERNAL_SECRET
              ? { 'X-Internal-Secret': this.config.SIGNALING_INTERNAL_SECRET }
              : {}),
          },
          timeout: 5000,
        },
      );
    } catch (err) {
      console.error('[call-handler] Failed to log call metadata:', (err as Error).message);
    }
  }
}
