import { describe, it, expect, vi } from 'vitest';
import {
  DepartmentRoundRobinStrategy,
  type PresenceStore,
  type StaffPresenceEntry,
} from '../adapters/department-round-robin.strategy';

const TENANT = 'tenant-001';
const DEPT = 'RECEPTION';

const STAFF_A: StaffPresenceEntry = {
  socketId: 'socket-A',
  identityId: 'identity-A',
  department: DEPT,
};

const STAFF_B: StaffPresenceEntry = {
  socketId: 'socket-B',
  identityId: 'identity-B',
  department: DEPT,
};

function makeStore(staff: StaffPresenceEntry[]): PresenceStore {
  return {
    getAvailableStaff: vi.fn().mockResolvedValue(staff),
  };
}

describe('DepartmentRoundRobinStrategy', () => {
  it('strategyName is DepartmentRoundRobin', () => {
    const s = new DepartmentRoundRobinStrategy(makeStore([]));
    expect(s.strategyName).toBe('DepartmentRoundRobin');
  });

  it('returns null when no staff are available', async () => {
    const strategy = new DepartmentRoundRobinStrategy(makeStore([]));
    const result = await strategy.route({ tenantId: TENANT, toDepartment: DEPT, callerIdentityId: 'guest-1' });
    expect(result).toBeNull();
  });

  it('returns null when toDepartment is not provided', async () => {
    const strategy = new DepartmentRoundRobinStrategy(makeStore([STAFF_A]));
    const result = await strategy.route({ tenantId: TENANT, callerIdentityId: 'guest-1' });
    expect(result).toBeNull();
  });

  it('returns the only available staff member', async () => {
    const strategy = new DepartmentRoundRobinStrategy(makeStore([STAFF_A]));
    const result = await strategy.route({ tenantId: TENANT, toDepartment: DEPT, callerIdentityId: 'guest-1' });

    expect(result).not.toBeNull();
    expect(result!.calleeSocketId).toBe('socket-A');
    expect(result!.calleeIdentityId).toBe('identity-A');
    expect(result!.calleeDepartment).toBe(DEPT);
  });

  it('distributes calls round-robin across multiple staff', async () => {
    const store = makeStore([STAFF_A, STAFF_B]);
    const strategy = new DepartmentRoundRobinStrategy(store);
    const req = { tenantId: TENANT, toDepartment: DEPT, callerIdentityId: 'guest-1' };

    const r1 = await strategy.route(req);
    const r2 = await strategy.route(req);
    const r3 = await strategy.route(req);

    // Should alternate A → B → A
    expect(r1!.calleeSocketId).toBe('socket-A');
    expect(r2!.calleeSocketId).toBe('socket-B');
    expect(r3!.calleeSocketId).toBe('socket-A');
  });

  it('queries the presence store with the correct tenant and department', async () => {
    const store = makeStore([STAFF_A]);
    const strategy = new DepartmentRoundRobinStrategy(store);
    await strategy.route({ tenantId: TENANT, toDepartment: 'HOUSEKEEPING', callerIdentityId: 'guest-1' });

    expect(store.getAvailableStaff).toHaveBeenCalledWith(TENANT, 'HOUSEKEEPING');
  });

  it('maintains separate counters per department', async () => {
    const receptionStore: PresenceStore = {
      getAvailableStaff: vi.fn().mockImplementation((_t, dept) =>
        dept === 'RECEPTION' ? [STAFF_A, STAFF_B] : [STAFF_A],
      ),
    };
    const strategy = new DepartmentRoundRobinStrategy(receptionStore);

    const r1 = await strategy.route({ tenantId: TENANT, toDepartment: 'RECEPTION', callerIdentityId: 'g1' });
    const r2 = await strategy.route({ tenantId: TENANT, toDepartment: 'HOUSEKEEPING', callerIdentityId: 'g2' });
    const r3 = await strategy.route({ tenantId: TENANT, toDepartment: 'RECEPTION', callerIdentityId: 'g3' });

    // RECEPTION counter: 0 → A, 1 → B (independent of HOUSEKEEPING)
    expect(r1!.calleeSocketId).toBe('socket-A');
    expect(r2!.calleeSocketId).toBe('socket-A'); // HOUSEKEEPING starts at 0
    expect(r3!.calleeSocketId).toBe('socket-B'); // RECEPTION counter is now 1
  });
});
