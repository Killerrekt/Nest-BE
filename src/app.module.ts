import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FlowTransformationService } from './flow-transformation.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, FlowTransformationService],
})
export class AppModule {}
