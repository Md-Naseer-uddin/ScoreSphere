import { Module } from '@nestjs/common';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [AccessTokenService, AuthGuard, AuthService, PasswordService, SessionService],
  exports: [AccessTokenService, AuthGuard, PasswordService, SessionService],
})
export class AuthModule {}
