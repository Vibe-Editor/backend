import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class StartAgentRunDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  segmentId?: string;

  @IsString()
  @IsOptional()
  projectId?: string;
}

export class ApprovalResponseDto {
  @IsString()
  @IsNotEmpty()
  approvalId: string;

  @IsBoolean()
  approved: boolean;
}

export class AgentRunResponseDto {
  runId?: string;
  finalOutput?: any;
  interruptions?: any[];
  approvalRequests?: any[];
  status: 'completed' | 'pending_approval' | 'error';
  message?: string;
}

export class StreamMessageDto {
  type: 'log' | 'approval_required' | 'result' | 'error' | 'completed';
  data: any;
  timestamp: Date;
}

export class ApprovalRequiredDto {
  approvalId: string;
  toolName: string;
  arguments: any;
  agentName: string;
}
