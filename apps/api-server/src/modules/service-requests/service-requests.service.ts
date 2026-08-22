import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient, ServiceRequest } from '@hotel-app/db';
import { PRISMA_TOKEN } from '../database/database.module';

@Injectable()
export class ServiceRequestsService {
  constructor(@Inject(PRISMA_TOKEN) private readonly db: PrismaClient) {}

  async create(params: {
    tenantId: string;
    guestId: string;
    department: string;
    category: string;
    details: Record<string, unknown>;
    roomIdentifier: string;
  }): Promise<ServiceRequest> {
    // Verify guest has an active grant
    const grant = await this.db.accessGrant.findFirst({
      where: { subjectId: params.guestId, status: 'ACTIVE' },
    });
    if (!grant) {
      throw new ForbiddenException('You must have an active check-in to place service requests.');
    }

    return this.db.serviceRequest.create({
      data: {
        tenantId: params.tenantId,
        guestId: params.guestId,
        department: params.department,
        category: params.category,
        details: params.details as object,
        status: 'SUBMITTED',
        roomIdentifier: params.roomIdentifier,
      },
    });
  }

  async listForGuest(guestId: string): Promise<ServiceRequest[]> {
    return this.db.serviceRequest.findMany({
      where: { guestId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForDepartment(tenantId: string, department: string): Promise<ServiceRequest[]> {
    return this.db.serviceRequest.findMany({
      where: { tenantId, department, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    requestId: string,
    tenantId: string,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
    assignedToId?: string,
  ): Promise<ServiceRequest> {
    const request = await this.db.serviceRequest.findFirst({
      where: { id: requestId, tenantId },
    });
    if (!request) throw new NotFoundException('Service request not found.');

    return this.db.serviceRequest.update({
      where: { id: requestId },
      data: {
        status,
        ...(assignedToId ? { assignedToId } : {}),
      },
    });
  }
}
