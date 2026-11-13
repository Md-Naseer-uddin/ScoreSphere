import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../database/database.module';
import { auditLogs } from '../database/schema';
import type { DbExecutor } from '../database/types';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  workspaceId?: string | null;
  /** Never put phone numbers, passwords, codes or tokens in here. */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(entry: AuditEntry, executor: DbExecutor = this.db): Promise<void> {
    await executor.insert(auditLogs).values({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      actorUserId: entry.actorUserId ?? null,
      workspaceId: entry.workspaceId ?? null,
      metadata: entry.metadata ?? {},
    });
  }
}
