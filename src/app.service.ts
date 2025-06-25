import { Body, Injectable, Req } from '@nestjs/common';
import { AgentConfig } from './type';
export class AgentToFlowJSON {
  agent: AgentConfig;
}

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getFlowJson(@Body() AgentToFlowJSON: AgentToFlowJSON): string {
    return 'Hello';
  }
}
