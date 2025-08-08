import { Injectable, Logger } from '@nestjs/common';
import { Agent, tool, run, RunState, RunResult } from '@openai/agents';
import { z } from 'zod';
import axios from 'axios';
import { Subject, Observable } from 'rxjs';

export interface ApprovalRequest {
  id: string;
  agentName: string;
  toolName: string;
  arguments: any;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: Date;
  authToken?: string;
}

export interface StreamMessage {
  type: 'log' | 'approval_required' | 'result' | 'error' | 'completed';
  data: any;
  timestamp: Date;
}

// Type definitions for tool parameters
interface ChatParams {
  model: string;
  gen_type: string;
  visual_prompt?: string;
  animation_prompt?: string;
  image_s3_key?: string;
  art_style: string;
  segmentId: string;
  projectId: string;
  userId: string;
}

interface ImageGenerationParams {
  script: string;
  art_style: string;
  segmentId: string;
  projectId: string;
  userId: string;
  model?: string;
}

interface SegmentationParams {
  prompt: string;
  concept: string;
  negative_prompt?: string;
  projectId: string;
  userId: string;
}

interface WebInfoParams {
  prompt: string;
  projectId: string;
  userId: string;
}

interface ConceptWriterParams {
  prompt: string;
  web_info: string;
  projectId: string;
  userId: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  // private readonly baseUrl = 'https://backend.usuals.ai';
  private readonly baseUrl = 'http://localhost:8080';
  private approvalRequests = new Map<string, ApprovalRequest>();
  private activeStreams = new Map<string, Subject<StreamMessage>>();

  // Create chat tool with auth token
  private createChatTool(authToken?: string) {
    return tool({
      name: 'chat',
      description: 'Send a chat message to generate content',
      // @ts-ignore
      parameters: {
        type: 'object',
        properties: {
          model: { type: 'string', description: 'Model to use' },
          gen_type: { type: 'string', description: 'Generation type' },
          visual_prompt: { type: 'string', description: 'Visual prompt' },
          animation_prompt: { type: 'string', description: 'Animation prompt' },
          image_s3_key: { type: 'string', description: 'Image S3 key' },
          art_style: { type: 'string', description: 'Art style' },
          segmentId: { type: 'string', description: 'Segment ID' },
          projectId: { type: 'string', description: 'Project ID' },
          userId: { type: 'string', description: 'User ID' },
        },
        required: ['model', 'gen_type', 'visual_prompt', 'animation_prompt', 'image_s3_key', 'art_style', 'segmentId', 'projectId', 'userId'],
        additionalProperties: false,
      },
      execute: async (params: ChatParams) => {
        try {
          const response = await axios.post(`${this.baseUrl}/chat`, params, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });

          return response.data;
        } catch (error) {
          this.logger.error(`❌ [CHAT] Error: ${error.message}`);
          throw new Error(`Failed to process chat request: ${error.message}`);
        }
      },
    });
  }

  // Create image generation tool with auth token
  private createImageGenerationTool(authToken?: string) {
    return tool({
      name: 'generate_image_with_approval',
      description: 'Generate an image after getting user approval for the script',
      // @ts-ignore
      parameters: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'Image generation script' },
          art_style: { type: 'string', description: 'Art style for the image' },
          segmentId: { type: 'string', description: 'Segment ID' },
          projectId: { type: 'string', description: 'Project ID' },
          userId: { type: 'string', description: 'User ID' },
          model: { type: 'string', description: 'Model to use' },
        },
        required: ['script', 'art_style', 'segmentId', 'projectId', 'userId', 'model'],
        additionalProperties: false,
      },
      needsApproval: true, // Always requires approval
      execute: async ({ script, art_style, segmentId, projectId, userId, model }: ImageGenerationParams) => {
        try {
          const response = await axios.post(`${this.baseUrl}/chat`, {
            model,
            gen_type: 'image',
            visual_prompt: script,
            art_style,
            segmentId,
            projectId,
          }, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });

          return {
            success: true,
            data: response.data,
            message: 'Image generation completed successfully',
          };
        } catch (error) {
          this.logger.error(`❌ [IMAGE] Error: ${error.message}`);
          throw new Error(`Failed to generate image: ${error.message}`);
        }
      },
    });
  }

  // Create segmentation tool with auth token
  private createSegmentationTool(authToken?: string) {
    return tool({
      name: 'generate_segmentation',
      description: 'Generate script segmentation for content creation',
      strict: false,
      // @ts-ignore
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Prompt for segmentation' },
          concept: { type: 'string', description: 'Concept for the content' },
          negative_prompt: { type: 'string', description: 'Negative prompt (optional)' },
          projectId: { type: 'string', description: 'Project ID' },
          userId: { type: 'string', description: 'User ID' },
        },
        required: ['prompt', 'concept', 'projectId', 'userId'],
        additionalProperties: true,
      },
      execute: async (params: SegmentationParams) => {
        try {
          const response = await axios.post(`${this.baseUrl}/segmentation`, params, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });

          return response.data;
        } catch (error) {
          this.logger.error(`❌ [SEGMENTATION] Error: ${error.message}`);
          throw new Error(`Failed to generate segmentation: ${error.message}`);
        }
      },
    });
  }

  // Create get-web-info tool with auth token
  private createGetWebInfoTool(authToken?: string) {
    return tool({
      name: 'get_web_info',
      description: 'Get web information and research data for content creation',
      strict: false,
      // @ts-ignore
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Prompt for web research' },
          projectId: { type: 'string', description: 'Project ID' },
          userId: { type: 'string', description: 'User ID' },
        },
        required: ['prompt', 'projectId', 'userId'],
        additionalProperties: true,
      },
      execute: async (params: WebInfoParams) => {
        try {
          const response = await axios.post(`${this.baseUrl}/get-web-info`, params, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });

          return response.data;
        } catch (error) {
          this.logger.error(`❌ [WEB-INFO] Error: ${error.message}`);
          throw new Error(`Failed to get web info: ${error.message}`);
        }
      },
    });
  }

  // Create concept-writer tool with auth token and approval
  private createConceptWriterTool(authToken?: string) {
    return tool({
      name: 'generate_concepts_with_approval',
      description: 'Generate 4 content concepts using web information and require user approval',
      strict: false,
      // @ts-ignore
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Prompt for concept generation' },
          web_info: { type: 'string', description: 'Web information to base concepts on' },
          projectId: { type: 'string', description: 'Project ID' },
          userId: { type: 'string', description: 'User ID' },
        },
        required: ['prompt', 'web_info', 'projectId', 'userId'],
        additionalProperties: true,
      },
      needsApproval: true, // Always requires approval
      execute: async (params: ConceptWriterParams) => {
        try {
          const response = await axios.post(`${this.baseUrl}/concept-writer`, params, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });

          return {
            success: true,
            data: response.data,
            message: 'Concepts generated successfully',
          };
        } catch (error) {
          this.logger.error(`❌ [CONCEPT-WRITER] Error: ${error.message}`);
          throw new Error(`Failed to generate concepts: ${error.message}`);
        }
      },
    });
  }

  // Create the main agent
  private createAgent(authToken?: string) {
    return new Agent({
      name: 'Content Generation Agent',
      instructions: `You are an AI agent that creates content using a structured workflow. For EVERY user prompt, you MUST follow this exact sequence:

      MANDATORY WORKFLOW FOR ALL REQUESTS:
      1. FIRST: Use get_web_info tool to research the user's request
      2. SECOND: Use generate_concepts_with_approval tool to create 4 concepts based on the web info
      3. THIRD: Wait for user approval of one concept, then return the selected concept
      
      CRITICAL RULES:
      - ALWAYS start with get_web_info for ANY user request (no exceptions)
      - ALWAYS use the web_info result as input for generate_concepts_with_approval
      - The concepts tool will generate 4 different concepts and require user approval
      - Return the selected concept as the final response after approval
      - Do NOT use any other tools unless specifically requested after the main workflow
      
      TOOL USAGE INSTRUCTIONS:
      
      For get_web_info tool:
      - Use the user's prompt as the prompt parameter
      - Use the provided projectId from context
      - Use the provided userId from context
      - Do NOT include authToken parameter - authentication is handled automatically
      
      For generate_concepts_with_approval tool:
      - Use the user's original prompt as the prompt parameter
      - Use the web_info result from the previous tool as the web_info parameter
      - Use the provided projectId from context
      - Use the provided userId from context
      - This tool requires approval - present the 4 concepts to the user for selection
      - Do NOT include authToken parameter - authentication is handled automatically
      
      EXAMPLE WORKFLOW:
      User: "Create a face wash advertisement"
      1. Call get_web_info with prompt="Create a face wash advertisement"
      2. Call generate_concepts_with_approval with the web_info result
      3. Present 4 concepts to user for approval
      4. Return selected concept as final response
      
      OTHER TOOLS (only use if specifically requested AFTER main workflow):
      - generate_image_with_approval: For image generation (requires approval)
      - generate_segmentation: For script segmentation
      - chat: For general content generation
      
      REMEMBER: Every interaction must start with web research and concept generation!`,
      tools: [
        this.createGetWebInfoTool(authToken),
        this.createConceptWriterTool(authToken),
        this.createChatTool(authToken),
        this.createImageGenerationTool(authToken),
        this.createSegmentationTool(authToken),
      ],
    });
  }

  // Start an agent run with streaming
  async startAgentRunStream(userInput: string, userId: string, authToken?: string, segmentId?: string, projectId?: string): Promise<Observable<StreamMessage>> {
    const streamId = this.generateStreamId();
    const streamSubject = new Subject<StreamMessage>();
    this.activeStreams.set(streamId, streamSubject);

    // Clean the auth token - remove "Bearer " prefix and trim whitespace
    const cleanAuthToken = authToken ? authToken.replace(/^Bearer\s+/i, '').trim() : undefined;

    // Start the agent run in the background
    this.runAgentWithStreaming(userInput, userId, streamSubject, streamId, cleanAuthToken, segmentId, projectId);

    return streamSubject.asObservable();
  }

  private async runAgentWithStreaming(
    userInput: string, 
    userId: string, 
    streamSubject: Subject<StreamMessage>, 
    streamId: string,
    authToken?: string,
    segmentId?: string,
    projectId?: string
  ) {
    try {
      streamSubject.next({
        type: 'log',
        data: { message: 'Starting agent run...' },
        timestamp: new Date()
      });

      const agent = this.createAgent(authToken);
      
      // Add user context to the input (don't include auth token - it's handled internally)
      const contextualInput = `${userInput}\n\nUser ID: ${userId}\nSegment ID: ${segmentId || 'default'}\nProject ID: ${projectId || 'default'}`;
      
      streamSubject.next({
        type: 'log',
        data: { message: 'Agent is processing your request...' },
        timestamp: new Date()
      });

      const result = await run(agent, contextualInput);
      
      // Handle interruptions (approvals needed)
      if (result.interruptions?.length > 0) {
        
        // Process each interruption
        for (const interruption of result.interruptions) {
          if (interruption.type === 'tool_approval_item') {
            const approvalId = this.generateApprovalId();
            const approvalRequest: ApprovalRequest = {
              id: approvalId,
              agentName: interruption.agent.name,
              toolName: interruption.rawItem.name,
              arguments: interruption.rawItem.arguments,
              status: 'pending',
              timestamp: new Date(),
              authToken,
            };
            
            this.approvalRequests.set(approvalId, approvalRequest);
            
            // Send approval required message to stream
            streamSubject.next({
              type: 'approval_required',
              data: {
                approvalId,
                toolName: interruption.rawItem.name,
                arguments: interruption.rawItem.arguments,
                agentName: interruption.agent.name
              },
              timestamp: new Date()
            });

            // Wait for approval
            await this.waitForApproval(approvalId, streamSubject);
            
            // After approval, continue with the tool execution
            if (this.approvalRequests.get(approvalId)?.status === 'approved') {
              streamSubject.next({
                type: 'log',
                data: { message: 'Approval received, continuing execution...' },
                timestamp: new Date()
              });

              // Execute the approved tool
              const toolResult = await this.executeApprovedTool(approvalRequest, streamSubject);
              
              streamSubject.next({
                type: 'result',
                data: toolResult,
                timestamp: new Date()
              });
            } else {
              streamSubject.next({
                type: 'log',
                data: { message: 'Request was rejected' },
                timestamp: new Date()
              });
            }

            // Clean up
            this.approvalRequests.delete(approvalId);
          }
        }
      }
      
      // Send completion message
      streamSubject.next({
        type: 'completed',
        data: { 
          finalOutput: result.finalOutput,
          message: 'Agent run completed successfully'
        },
        timestamp: new Date()
      });
      
    } catch (error) {
      this.logger.error(`❌ [AGENT] Error: ${error.message}`);
      streamSubject.next({
        type: 'error',
        data: { message: error.message },
        timestamp: new Date()
      });
    } finally {
      // Clean up stream
      this.activeStreams.delete(streamId);
      streamSubject.complete();
    }
  }

  private async waitForApproval(approvalId: string, streamSubject: Subject<StreamMessage>): Promise<void> {
    return new Promise((resolve) => {
      const checkApproval = () => {
        const request = this.approvalRequests.get(approvalId);
        if (request && (request.status === 'approved' || request.status === 'rejected')) {
          resolve();
        } else {
          // Check again in 1 second
          setTimeout(checkApproval, 1000);
        }
      };
      checkApproval();
    });
  }

  private async executeApprovedTool(approvalRequest: ApprovalRequest, streamSubject: Subject<StreamMessage>): Promise<any> {
    try {
      const { toolName, arguments: args, authToken } = approvalRequest;
      
      if (toolName === 'generate_image_with_approval') {
        const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
        const { script, art_style, segmentId, projectId, userId, model } = parsedArgs;
        
        streamSubject.next({
          type: 'log',
          data: { message: 'Generating image...' },
          timestamp: new Date()
        });

        if (!authToken) {
          throw new Error('Authentication token is missing from approval request');
        }

        const response = await axios.post(`${this.baseUrl}/chat`, {
          model,
          gen_type: 'image',
          visual_prompt: script,
          art_style,
          segmentId,
          projectId,
        }, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        });

        return {
          success: true,
          data: response.data,
          message: 'Image generation completed successfully',
        };
      }

      if (toolName === 'generate_concepts_with_approval') {
        const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
        const { prompt, web_info, projectId, userId } = parsedArgs;
        
        streamSubject.next({
          type: 'log',
          data: { message: 'Generating concepts...' },
          timestamp: new Date()
        });

        if (!authToken) {
          throw new Error('Authentication token is missing from approval request');
        }

        const response = await axios.post(`${this.baseUrl}/concept-writer`, {
          prompt,
          web_info,
          projectId,
        }, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        });

        return {
          success: true,
          data: response.data,
          message: 'Concepts generated successfully',
        };
      }
      
      return { message: 'Tool executed successfully' };
    } catch (error) {
      this.logger.error(`❌ [TOOL] Error: ${error.message}`);
      throw error;
    }
  }

  // Handle approval/rejection from frontend
  async handleApproval(approvalId: string, approved: boolean, userId: string): Promise<any> {
    const approvalRequest = this.approvalRequests.get(approvalId);
    if (!approvalRequest) {
      throw new Error('Approval request not found');
    }

    // Update approval status
    approvalRequest.status = approved ? 'approved' : 'rejected';

    return {
      status: 'success',
      message: `Request ${approved ? 'approved' : 'rejected'} successfully`,
    };
  }

  // Get pending approval requests
  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvalRequests.values()).filter(
      req => req.status === 'pending'
    );
  }

  // Get approval request by ID
  getApprovalRequest(approvalId: string): ApprovalRequest | undefined {
    return this.approvalRequests.get(approvalId);
  }

  // Clean up old approval requests (optional maintenance method)
  cleanupOldApprovals(maxAgeHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let cleanedCount = 0;
    
    for (const [id, request] of this.approvalRequests.entries()) {
      if (request.timestamp < cutoffTime) {
        this.approvalRequests.delete(id);
        cleanedCount++;
      }
    }
    
    this.logger.log(`🧹 [CLEANUP] Removed ${cleanedCount} old approval requests`);
  }

  private generateStreamId(): string {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateApprovalId(): string {
    return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}