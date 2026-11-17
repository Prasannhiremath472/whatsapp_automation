import { Module } from '@nestjs/common';
import { MediaController, PublicFilesController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  controllers: [MediaController, PublicFilesController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
