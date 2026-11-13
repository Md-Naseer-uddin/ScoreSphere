import {
  createInvitationRequestSchema,
  createOrganizationRequestSchema,
  invitationTokenRequestSchema,
  updateMemberRequestSchema,
  updateWorkspaceRequestSchema,
} from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';

export class CreateOrganizationDto extends createZodDto(createOrganizationRequestSchema) {}
export class UpdateWorkspaceDto extends createZodDto(updateWorkspaceRequestSchema) {}
export class UpdateMemberDto extends createZodDto(updateMemberRequestSchema) {}
export class CreateInvitationDto extends createZodDto(createInvitationRequestSchema) {}
export class InvitationTokenDto extends createZodDto(invitationTokenRequestSchema) {}
