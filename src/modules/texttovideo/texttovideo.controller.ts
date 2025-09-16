import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Res,
  Headers,
} from '@nestjs/common';
import { Response } from 'express';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { TextToVideoService } from './texttovideo.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import {
  StartAgentRunDto,
  ApprovalResponseDto,
  AgentRunResponseDto,
} from './dto/agent.dto';

export class TextToVideoDto {
  @IsString()
  @IsNotEmpty()
  text_prompt: string;

  @IsString()
  @IsNotEmpty()
  art_style: string;

  @IsString()
  @IsNotEmpty()
  segmentId: string;

  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsOptional()
  model?: string;
}

@Controller('texttovideo')
@UseGuards(JwtAuthGuard)
export class TextToVideoController {
  constructor(private readonly textToVideoService: TextToVideoService) {}

  @Post()
  async generateTextToVideo(
    @Body() textToVideoDto: TextToVideoDto,
    @CurrentUser('id') userId: string,
  ) {
    const { text_prompt, art_style, segmentId, projectId, model } = textToVideoDto;

    try {
      const result = await this.textToVideoService.generateTextToVideo(
        segmentId,
        text_prompt,
        art_style,
        projectId,
        model,
      );

      return {
        success: true,
        data: result,
        message: 'Text-to-video generation completed successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Text-to-video generation failed',
      };
    }
  }

  @Post('workflow')
  async startTextToVideoWorkflow(
    @Body() startAgentRunDto: StartAgentRunDto,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
    @Headers('authorization') authHeader?: string,
  ): Promise<void> {
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

      const stream = await this.textToVideoService.startTextToVideoWorkflowStream(
        startAgentRunDto.prompt,
        userId,
        authHeader,
        startAgentRunDto.segmentId,
        startAgentRunDto.projectId,
      );

      const subscription = stream.subscribe({
        next: (message) => {
          const eventData = `data: ${JSON.stringify(message)}\n\n`;
          res.write(eventData);
        },
        error: (error) => {
          const errorData = `data: ${JSON.stringify({
            type: 'error',
            data: { message: error.message },
            timestamp: new Date(),
          })}\n\n`;
          res.write(errorData);
          res.end();
        },
        complete: () => {
          res.end();
        },
      });

      res.on('close', () => {
        subscription.unsubscribe();
      });
    } catch (error) {
      const errorData = `data: ${JSON.stringify({
        type: 'error',
        data: { message: error.message },
        timestamp: new Date(),
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
      const { approvalId, approved, ...additionalData } = approvalResponseDto;

      const result = await this.textToVideoService.handleApproval(
        approvalId,
        approved,
        userId,
        additionalData,
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
    return this.textToVideoService.getPendingApprovals();
  }

  @Get('approvals/:approvalId')
  async getApprovalRequest(@Param('approvalId') approvalId: string) {
    const request = this.textToVideoService.getApprovalRequest(approvalId);
    if (!request) {
      return { message: 'Approval request not found' };
    }
    return request;
  }

  @Post('cleanup')
  async cleanupOldApprovals() {
    this.textToVideoService.cleanupOldApprovals();
    return { message: 'Cleanup completed' };
  }
}
