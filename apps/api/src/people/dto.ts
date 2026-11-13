import {
  createRosterMemberRequestSchema,
  lookupRequestSchema,
  rosterLinkTargetSchema,
  updateRosterMemberRequestSchema,
} from '@scoresphere/contracts';
import { createZodDto } from 'nestjs-zod';

export class LookupDto extends createZodDto(lookupRequestSchema) {}
export class CreateRosterMemberDto extends createZodDto(createRosterMemberRequestSchema) {}
export class UpdateRosterMemberDto extends createZodDto(updateRosterMemberRequestSchema) {}
export class LinkRosterMemberDto extends createZodDto(rosterLinkTargetSchema) {}
