import {
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
} from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';

export class RegisterDto extends createZodDto(registerRequestSchema) {}
export class LoginDto extends createZodDto(loginRequestSchema) {}
export class RefreshDto extends createZodDto(refreshRequestSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordRequestSchema) {}
