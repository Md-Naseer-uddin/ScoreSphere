import { hash, verify } from '@node-rs/argon2';
import { Injectable, type OnModuleInit } from '@nestjs/common';

/** Argon2id with OWASP's minimum recommended parameters. `2` is `Algorithm.Argon2id` (a const enum). */
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    // Verifying against this when an account doesn't exist keeps response times uniform.
    this.dummyHash = await hash('dummy-password-for-timing', OPTIONS);
  }

  hash(plain: string): Promise<string> {
    return hash(plain, OPTIONS);
  }

  async verify(hashed: string | null | undefined, plain: string): Promise<boolean> {
    try {
      return await verify(hashed ?? this.dummyHash, plain);
    } catch {
      return false;
    }
  }
}
