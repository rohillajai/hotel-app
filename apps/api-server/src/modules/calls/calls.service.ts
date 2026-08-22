import { Injectable, Inject } from '@nestjs/common';
import type { PrismaClient, CallLog } from '@hotel-app/db';
import { PRISMA_TOKEN } from '../database/database.module';

export interface CreateCallLogParams {
  tenantId: string;
  callerId: string;
  calleeDept: string | null;
  calleeId: string | null;
  roomIdentifier: string | null;
  callId: string;
  initiatedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSecs: number | null;
  outcome: 'ANSWERED' | 'MISSED' | 'REJECTED' | 'FAILED' | null;
  turnRelayed: boolean;
}

@Injectable()
export class CallsService {
  constructor(@Inject(PRISMA_TOKEN) private readonly db: PrismaClient) {}

  async createLog(params: CreateCallLogParams): Promise<CallLog> {
    return this.db.callLog.create({
      data: {
        tenantId: params.tenantId,
        callerId: params.callerId,
        calleeDept: params.calleeDept,
        calleeId: params.calleeId,
        roomIdentifier: params.roomIdentifier,
        callId: params.callId,
        initiatedAt: params.initiatedAt,
        answeredAt: params.answeredAt,
        endedAt: params.endedAt,
        durationSecs: params.durationSecs,
        outcome: params.outcome,
        turnRelayed: params.turnRelayed,
      },
    });
  }

  async listByTenant(
    tenantId: string,
    filters?: {
      department?: string;
      roomIdentifier?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
    cursor?: string,
    limit = 50,
  ): Promise<CallLog[]> {
    return this.db.callLog.findMany({
      where: {
        tenantId,
        ...(filters?.department ? { calleeDept: filters.department } : {}),
        ...(filters?.roomIdentifier ? { roomIdentifier: filters.roomIdentifier } : {}),
        ...(filters?.dateFrom || filters?.dateTo
          ? {
              initiatedAt: {
                ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                ...(filters.dateTo ? { lte: filters.dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: { initiatedAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }
}
