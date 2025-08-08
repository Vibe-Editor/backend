import { Controller, Post, Body, Get, Param, UseGuards, Res, Sse, Headers } from '@nestjs/common';
import { Response } from 'express';
import { AgentService } from './agent.service';
import { StartAgentRunDto, ApprovalResponseDto, AgentRunResponseDto } from './dto/agent.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('run')
  async startAgentRun(
    @Body() startAgentRunDto: StartAgentRunDto,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
    @Headers('authorization') authHeader?: string,
  ): Promise<void> {
    try {
      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

      // Get the stream from the agent service
      const stream = await this.agentService.startAgentRunStream(
        startAgentRunDto.prompt,
        userId,
        authHeader,
        startAgentRunDto.segmentId,
        startAgentRunDto.projectId,
      );

      // Subscribe to the stream and send events to the client
      const subscription = stream.subscribe({
        next: (message) => {
          const eventData = `data: ${JSON.stringify(message)}\n\n`;
          res.write(eventData);
        },
        error: (error) => {
          const errorData = `data: ${JSON.stringify({
            type: 'error',
            data: { message: error.message },
            timestamp: new Date()
          })}\n\n`;
          res.write(errorData);
          res.end();
        },
        complete: () => {
          res.end();
        }
      });

      // Handle client disconnect
      res.on('close', () => {
        subscription.unsubscribe();
      });

    } catch (error) {
      const errorData = `data: ${JSON.stringify({
        type: 'error',
        data: { message: error.message },
        timestamp: new Date()
      })}\n\n`;
      res.write(errorData);
      res.end();
    }
  }

  @Post('approval')
  async handleApproval(
    @Body() approvalResponseDto: ApprovalResponseDto,
    @CurrentUser('id') userId: string,
  ): Promise<AgentRunResponseDto> {
    try {
      const result = await this.agentService.handleApproval(
        approvalResponseDto.approvalId,
        approvalResponseDto.approved,
        userId,
      );

      return result;
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  @Get('approvals/pending')
  async getPendingApprovals() {
    return this.agentService.getPendingApprovals();
  }

  @Get('approvals/:approvalId')
  async getApprovalRequest(@Param('approvalId') approvalId: string) {
    const request = this.agentService.getApprovalRequest(approvalId);
    if (!request) {
      return { message: 'Approval request not found' };
    }
    return request;
  }

  @Post('cleanup')
  async cleanupOldApprovals() {
    this.agentService.cleanupOldApprovals();
    return { message: 'Cleanup completed' };
  }
}
