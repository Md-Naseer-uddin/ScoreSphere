import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { persons, phoneIdentities, users } from '../database/schema';
import type { DbExecutor } from '../database/types';

/** Global person identities (ADR 0010). */
@Injectable()
export class PersonsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Returns the account's person, creating it on first need. If a pending person already
   * holds the account's number (someone added it before sign-up), that person is claimed.
   */
  async ensureForUser(userId: string, executor: DbExecutor = this.db): Promise<string> {
    const [existing] = await executor
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.userId, userId));
    if (existing) return existing.id;

    const [user] = await executor
      .select({ phoneIdentityId: users.phoneIdentityId })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new Error(`User ${userId} not found`);

    const [pending] = await executor
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.phoneIdentityId, user.phoneIdentityId));
    if (pending) {
      await executor
        .update(persons)
        .set({ userId, status: 'CLAIMED' })
        .where(eq(persons.id, pending.id));
      return pending.id;
    }

    const [created] = await executor
      .insert(persons)
      .values({ phoneIdentityId: user.phoneIdentityId, userId, status: 'CLAIMED' })
      .onConflictDoNothing()
      .returning({ id: persons.id });
    if (created) return created.id;
    const [raced] = await executor
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.userId, userId));
    return raced!.id;
  }

  /** The pending person for a number with no account, creating the number's identity if needed. */
  async ensurePendingForPhone(phone: string, executor: DbExecutor = this.db): Promise<string> {
    await executor
      .insert(phoneIdentities)
      .values({ phoneE164: phone, status: 'INVITED' })
      .onConflictDoNothing();
    const [identity] = await executor
      .select({ id: phoneIdentities.id })
      .from(phoneIdentities)
      .where(eq(phoneIdentities.phoneE164, phone));
    await executor
      .insert(persons)
      .values({ phoneIdentityId: identity!.id, status: 'PENDING_CLAIM' })
      .onConflictDoNothing();
    const [person] = await executor
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.phoneIdentityId, identity!.id));
    return person!.id;
  }
}

@Global()
@Module({ providers: [PersonsService], exports: [PersonsService] })
export class PersonsModule {}
