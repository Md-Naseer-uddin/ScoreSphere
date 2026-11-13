import {
  changePasswordRequestSchema,
  changePhoneRequestSchema,
  confirmPasswordRequestSchema,
  updateMeRequestSchema,
} from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';

export class UpdateMeDto extends createZodDto(updateMeRequestSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordRequestSchema) {}
export class ChangePhoneDto extends createZodDto(changePhoneRequestSchema) {}
export class ConfirmPasswordDto extends createZodDto(confirmPasswordRequestSchema) {}
