import { IsString, IsNotEmpty, IsOptional, IsBoolean, ValidateIf, IsArray } from 'class-validator';

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

  @IsOptional()
  @IsArray()
  @ValidateIf((o) => o.segments !== null)
  segments?: any[] | null;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.art_style !== null)
  art_style?: string | null;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.model !== null)
  model?: string | null;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.segmentId !== null)
  segmentId?: string | null;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.projectId !== null)
  projectId?: string | null;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.userId !== null)
  userId?: string | null;

  @IsOptional()
  @IsBoolean()
  @ValidateIf((o) => o.isRetry !== null)
  isRetry?: boolean | null;

  @IsOptional()
  @IsArray()
  @ValidateIf((o) => o.retrySegmentIds !== null)
  retrySegmentIds?: string[] | null;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.prompt !== null)
  prompt?: string | null;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.web_info !== null)
  web_info?: string | null;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.concept !== null)
  concept?: string | null;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.concept !== null)
  negative_prompt?: string | null;
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
