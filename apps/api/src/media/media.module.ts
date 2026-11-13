import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';
import { MediaController } from './media.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [UsersModule],
  controllers: [AvatarController, MediaController],
  providers: [AvatarService, StorageService],
  exports: [StorageService],
})
export class MediaModule {}
