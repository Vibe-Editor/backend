import { Injectable, Logger } from '@nestjs/common';
import { Agent, tool, run } from '@openai/agents';
import axios from 'axios';
import { Subject, Observable } from 'rxjs';
import { TextToVideoService } from './texttovideo.service';

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
  private readonly baseUrl = process.env.BASE_URL;
  private approvalRequests = new Map<string, ApprovalRequest>();
  private activeStreams = new Map<string, Subject<StreamMessage>>();

  constructor(private readonly textToVideoService: TextToVideoService) {}

  // Create chat tool with auth token
  private createChatTool(authToken?: string) {
    return tool({
      name: 'chat',
      description: 'Send a chat message to generate content',
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
        required: [
          'model',
          'gen_type',
          'visual_prompt',
          'animation_prompt',
          'image_s3_key',
          'art_style',
          'segmentId',
          'projectId',
          'userId',
        ],
        additionalProperties: false,
      },
      execute: async (params: ChatParams) => {
        try {
          this.logger.log(
            `➡️ [CHAT] POST /chat model=${params.model} gen_type=${params.gen_type} projectId=${params.projectId}`,
          );
          const response = await axios.post(`${this.baseUrl}/chat`, params, {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          });
          this.logger.log(`✅ [CHAT] ${response.status} OK`);
          return response.data;
        } catch (error) {
          this.logger.error(`❌ [CHAT] Error: ${error.message}`);
          throw new Error(`Failed to process chat request: ${error.message}`);
        }
      },
    });
  }

  // Text-to-Video Generation Tool using Fal AI Veo3
  private createTextToVideoTool(authToken?: string) {
    return tool({
      name: 'generate_video_with_approval',
      description:
        'Generate a video directly from text prompts using Fal AI Veo3 model',
      parameters: {
        type: 'object',
        properties: {
          segments: {
            type: 'array',
            description:
              'Array of segments with text prompts for video generation',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Segment ID' },
                text_prompt: {
                  type: 'string',
                  description: 'Text prompt for video generation',
                },
              },
              required: ['id', 'text_prompt'],
              additionalProperties: false,
            },
          },
          art_style: { type: 'string', description: 'Art style for the video' },
          projectId: { type: 'string', description: 'Project ID' },
          model: {
            type: 'string',
            description: 'Model to use for video generation (fal-ai/veo3)',
            default: 'fal-ai/veo3'
          },
          isRetry: {
            type: 'boolean',
            description: 'Whether this is a retry attempt',
          },
          retrySegmentIds: {
            type: 'array',
            description:
              'Array of segment IDs to retry (only used if isRetry is true)',
            items: { type: 'string' },
          },
        },
        required: [
          'segments',
          'art_style',
          'projectId',
          'model',
          'isRetry',
          'retrySegmentIds',
        ],
        additionalProperties: false,
      },
      needsApproval: true, // Always requires approval
      execute: async ({
        segments,
        art_style,
        projectId,
        model,
        isRetry = false,
      }) => {
        try {
          this.logger.log(
            `➡️ [TEXT-TO-VIDEO] POST /texttovideo model=${model} projectId=${projectId}`,
          );

          return {
            success: true,
            data: '',
            message: `Text-to-video generation complete`,
          };
        } catch (error) {
          this.logger.error(`❌ [TEXT-TO-VIDEO] Error: ${error.message}`);
          throw new Error(`Failed to generate video: ${error.message}`);
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
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Prompt for segmentation' },
          concept: { type: 'string', description: 'Concept for the content' },
          negative_prompt: {
            type: 'string',
            description: 'Negative prompt (optional)',
          },
          projectId: { type: 'string', description: 'Project ID' },
          userId: { type: 'string', description: 'User ID' },
        },
        required: ['prompt', 'concept', 'projectId', 'userId'],
        additionalProperties: true,
      },
      needsApproval: true,
      execute: async (params: SegmentationParams) => {
        try {
          this.logger.log(
            `➡️ [SEGMENTATION] POST /segmentation projectId=${params.projectId}`,
          );
          console.log(params);
          // const response = await axios.post(`${this.baseUrl}/segmentation`, params, {
          //   headers: {
          //     'Authorization': `Bearer ${authToken}`,
          //     'Content-Type': 'application/json',
          //   },
          // });
          // this.logger.log(`✅ [SEGMENTATION] ${response.status} OK`);
          // console.log(response.data)
          // return response.data;
          return 'Segmentation executed successfully';
        } catch (error) {
          console.log(error);
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
          this.logger.log(
            `➡️ [WEB-INFO] POST /get-web-info projectId=${params.projectId}`,
          );
          const response = await axios.post(
            `${this.baseUrl}/get-web-info`,
            params,
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
              },
            },
          );
          this.logger.log(`✅ [WEB-INFO] ${response.status} OK`);
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
      description:
        'Generate 4 content concepts using web information and require user approval',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Prompt for concept generation',
          },
          web_info: {
            type: 'string',
            description: 'Web information to base concepts on',
          },
          projectId: { type: 'string', description: 'Project ID' },
          userId: { type: 'string', description: 'User ID' },
        },
        required: ['prompt', 'web_info', 'projectId', 'userId'],
        additionalProperties: true,
      },
      needsApproval: true, // Always requires approval
      execute: async (params: ConceptWriterParams) => {
        try {
          // this.logger.log(`➡️ [CONCEPT-WRITER] POST /concept-writer projectId=${params.projectId}`);
          // const response = await axios.post(`${this.baseUrl}/concept-writer`, params, {
          //   headers: {
          //     'Authorization': `Bearer ${authToken}`,
          //     'Content-Type': 'application/json',
          //   },
          // });
          // this.logger.log(`✅ [CONCEPT-WRITER] ${response.status} OK`);
          return {
            success: true,
            data: '',
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
      name: 'Text-to-Video Generation Agent',
      instructions: `You are a Text-to-Video Creation Agent that MUST execute ALL 4 tools in sequence without asking for permission between steps.
    
  MANDATORY EXECUTION SEQUENCE - DO THIS NOW:
  1. 🔄 Call get_web_info tool FIRST
  2. 🔄 Call generate_concepts_with_approval tool using web_info from step 1
  3. 🔄 Call generate_segmentation tool using the approved concept from step 2
  4. 🔄 Call generate_video_with_approval tool using the segmentation results from step 3 (DIRECT TEXT-TO-VIDEO)


  CRITICAL EXECUTION RULES:
  - IMMEDIATELY call the next tool after each completion
  - Use output from previous tools as input for next tools
  - For video generation, extract the text/script content from segmentation results
  - Use appropriate art_style (default to "realistic" if not specified by user)
  - Use fal-ai/veo3 model for text-to-video generation
  - DO NOT provide summaries or ask questions between tools
  - EXECUTE ALL 4 TOOLS AUTOMATICALLY IN SEQUENCE
  - SKIP IMAGE GENERATION - GO DIRECTLY FROM SEGMENTATION TO VIDEO
  
  TOOL PARAMETER MAPPING:
  - get_web_info: Use user's prompt directly
  - generate_concepts_with_approval: Use prompt + web_info from step 1
  - generate_segmentation: Use prompt + selected concept from step 2
  - generate_video_with_approval: Use segments with text prompts from segmentation + art_style + fal-ai/veo3 model
    `,

      tools: [
        this.createGetWebInfoTool(authToken),
        this.createConceptWriterTool(authToken),
        this.createChatTool(authToken),
        this.createSegmentationTool(authToken),
        this.createTextToVideoTool(authToken),
      ],
    });
  }

  // Start an agent run with streaming
  async startAgentRunStream(
    userInput: string,
    userId: string,
    authToken?: string,
    segmentId?: string,
    projectId?: string,
  ): Promise<Observable<StreamMessage>> {
    const streamId = this.generateStreamId();
    const streamSubject = new Subject<StreamMessage>();
    this.activeStreams.set(streamId, streamSubject);

    // Clean the auth token - remove "Bearer " prefix and trim whitespace
    const cleanAuthToken = authToken
      ? authToken.replace(/^Bearer\s+/i, '').trim()
      : undefined;

    // Start the agent run in the background
    this.runAgentWithStreaming(
      userInput,
      userId,
      streamSubject,
      streamId,
      cleanAuthToken,
      segmentId,
      projectId,
    );

    return streamSubject.asObservable();
  }

  private async runAgentWithStreaming(
    userInput: string,
    userId: string,
    streamSubject: Subject<StreamMessage>,
    streamId: string,
    authToken?: string,
    segmentId?: string,
    projectId?: string,
  ) {
    try {
      this.logger.log(`🚀 [RUN] start userId=${userId} projectId=${projectId}`);
      streamSubject.next({
        type: 'log',
        data: { message: 'Starting agent run...' },
        timestamp: new Date(),
      });

      const agent = this.createAgent(authToken);

      // Add user context to the input (don't include auth token - it's handled internally)
      const contextualInput = `${userInput}\n\nUser ID: ${userId}\nSegment ID: ${segmentId || 'default'}\nProject ID: ${projectId || 'default'}`;

      streamSubject.next({
        type: 'log',
        data: { message: 'Agent is processing your request...' },
        timestamp: new Date(),
      });

      let result = await run(agent, contextualInput);
      this.logger.log(
        `📊 [RUN] interruptions=${result.interruptions?.length || 0}`,
      );

      // Handle interruptions (approvals needed)
      while (result.interruptions?.length > 0) {
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
            this.logger.log(
              `⏸️ [APPROVAL] pending id=${approvalId} tool=${interruption.rawItem.name}`,
            );

            // Send approval required message to stream
            streamSubject.next({
              type: 'approval_required',
              data: {
                approvalId,
                toolName: interruption.rawItem.name,
                arguments: interruption.rawItem.arguments,
                agentName: interruption.agent.name,
              },
              timestamp: new Date(),
            });

            // Wait for approval
            await this.waitForApproval(approvalId, streamSubject);

            // After approval, continue with the tool execution
            if (this.approvalRequests.get(approvalId)?.status === 'approved') {
              this.logger.log(`✅ [APPROVAL] approved id=${approvalId}`);
              streamSubject.next({
                type: 'log',
                data: { message: 'Approval received, continuing execution...' },
                timestamp: new Date(),
              });
              result.state.approve(interruption);
              // Execute the approved tool
              const toolResult = await this.executeApprovedTool(
                approvalRequest,
                streamSubject,
              );

              streamSubject.next({
                type: 'result',
                data: toolResult,
                timestamp: new Date(),
              });
            } else {
              this.logger.log(`❌ [APPROVAL] rejected id=${approvalId}`);
              streamSubject.next({
                type: 'log',
                data: { message: 'Request was rejected' },
                timestamp: new Date(),
              });
              result.state.reject(interruption);
            }

            // Clean up
            this.approvalRequests.delete(approvalId);
            this.logger.log(`🧹 [APPROVAL] cleared id=${approvalId}`);
          }
        }

        result = await run(agent, result.state);
      }

      // Send completion message
      this.logger.log(`🏁 [RUN] completed`);
      streamSubject.next({
        type: 'completed',
        data: {
          finalOutput: result.finalOutput,
          message: 'Agent run completed successfully',
        },
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`❌ [AGENT] Error: ${error.message}`);
      streamSubject.next({
        type: 'error',
        data: { message: error.message },
        timestamp: new Date(),
      });
    } finally {
      // Clean up stream
      this.activeStreams.delete(streamId);
      streamSubject.complete();
    }
  }

  private async waitForApproval(
    approvalId: string,
    streamSubject: Subject<StreamMessage>,
  ): Promise<void> {
    return new Promise((resolve) => {
      const checkApproval = () => {
        const request = this.approvalRequests.get(approvalId);
        if (
          request &&
          (request.status === 'approved' || request.status === 'rejected')
        ) {
          resolve();
        } else {
          // Check again in 1 second
          setTimeout(checkApproval, 1000);
        }
      };
      checkApproval();
    });
  }

  private async executeApprovedTool(
    approvalRequest: ApprovalRequest,
    streamSubject: Subject<StreamMessage>,
  ): Promise<any> {
    try {
      const { toolName, arguments: args, authToken } = approvalRequest;


      if (toolName === 'generate_video_with_approval') {
        const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
        const {
          segments,
          art_style,
          projectId,
          model = 'fal-ai/veo3',
          isRetry = false,
          retrySegmentIds = [],
        } = parsedArgs;

        console.log('Text-to-Video Generation:', segments, art_style, projectId, model);

        // Determine which segments to process
        const segmentsToProcess = isRetry
          ? segments.filter((seg) => retrySegmentIds.includes(seg.id))
          : segments;

        const totalSegments = segmentsToProcess.length;
        const results = [];
        let successCount = 0;
        let failureCount = 0;

        streamSubject.next({
          type: 'log',
          data: {
            message: isRetry
              ? `Retrying text-to-video generation for ${totalSegments} segments using ${model}...`
              : `Generating videos directly from text for ${totalSegments} segments using ${model}...`,
          },
          timestamp: new Date(),
        });

        if (!authToken) {
          throw new Error(
            'Authentication token is missing from approval request',
          );
        }

        for (let i = 0; i < segmentsToProcess.length; i++) {
          const segment = segmentsToProcess[i];

          try {
            const videoResult = await this.textToVideoService.generateTextToVideo(
              segment.id,
              segment.text_prompt,
              art_style,
              projectId,
              model,
            );

            console.log('TEXT-TO-VIDEO RESPONSE DATA:', videoResult);
            const result = {
              segmentId: segment.id,
              status: 'success',
              videoData: videoResult,
            };

            results.push(result);
            successCount++;

            // Stream success immediately when this segment completes
            streamSubject.next({
              type: 'log',
              data: {
                segmentId: segment.id,
                message: `🎬 Segment ${segment.id} text-to-video completed successfully`,
                VideoData: videoResult,
              },
              timestamp: new Date(),
            });
          } catch (error) {
            console.log(error);
            const result = {
              segmentId: segment.id,
              status: 'failed',
              error: error.message,
            };

            results.push(result);
            failureCount++;

            // Stream failure immediately when this segment fails
            streamSubject.next({
              type: 'log',
              data: {
                message: `❌ Segment ${segment.id} text-to-video failed: ${error.message}`,
              },
              timestamp: new Date(),
            });

            this.logger.error(
              `❌ [TEXT-TO-VIDEO] Segment ${segment.id} failed: ${error.message}`,
            );
          }
        }

        const finalMessage = `Text-to-video generation ${isRetry ? 'retry' : ''} completed: ${successCount} success, ${failureCount} failed`;

        streamSubject.next({
          type: 'log',
          data: { message: finalMessage },
          timestamp: new Date(),
        });

        return {
          success: failureCount === 0,
          totalSegments,
          successCount,
          failureCount,
          results,
          isRetry,
          message: finalMessage,
        };
      }

      if (toolName === 'generate_concepts_with_approval') {
        const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
        const { prompt, web_info, projectId, userId } = parsedArgs;

        // console.log({ "prompt": prompt, "web_info": web_info, "projectId": projectId })

        streamSubject.next({
          type: 'log',
          data: { message: 'Generating concepts...' },
          timestamp: new Date(),
        });

        if (!authToken) {
          throw new Error(
            'Authentication token is missing from approval request',
          );
        }

        const response = await axios.post(
          `${this.baseUrl}/concept-writer`,
          {
            prompt,
            web_info,
            projectId,
          },
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        return {
          success: true,
          data: response.data,
          message: 'Concepts generated successfully',
        };
      }

      if (toolName === 'generate_segmentation') {
        const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
        const {
          prompt,
          concept_id,
          concept,
          negative_prompt,
          projectId,
          model,
        } = parsedArgs;
        // console.log({ "prompt": prompt, "concept": concept, "negative_prompt": negative_prompt, "projectId": projectId })

        streamSubject.next({
          type: 'log',
          data: { message: 'Generating script segmentation...' },
          timestamp: new Date(),
        });

        if (!authToken) {
          throw new Error(
            'Authentication token is missing from approval request',
          );
        }

        try {
          this.logger.log(
            `➡️ [SEGMENTATION] POST /segmentation projectId=${projectId}`,
          );
          console.log(parsedArgs);

          const response = await axios.post(
            `${this.baseUrl}/segmentation`,
            {
              prompt,
              concept,
              negative_prompt,
              projectId,
              model,
            },
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
              },
            },
          );

          this.logger.log(`✅ [SEGMENTATION] ${response.status} OK`);
          return {
            success: true,
            data: response.data,
            concept_id,
            message: 'Script segmentation completed successfully',
          };
        } catch (error) {
          console.log(error);
          this.logger.error(`❌ [SEGMENTATION] Error: ${error.message}`);
          throw new Error(`Failed to generate segmentation: ${error.message}`);
        }
      }

      return { message: 'Tool executed successfully' };
    } catch (error) {
      this.logger.error(`❌ [TOOL] Error: ${error.message}`);
      throw error;
    }
  }

  // Handle approval/rejection from frontend
  async handleApproval(
    approvalId: string,
    approved: boolean,
    userId: string,
    additionalData?: any,
  ): Promise<any> {
    const approvalRequest = this.approvalRequests.get(approvalId);
    if (!approvalRequest) {
      throw new Error('Approval request not found');
    }

    if (additionalData && approved) {
      approvalRequest.arguments = {
        ...approvalRequest.arguments,
        ...additionalData, // ← This adds segments, art_style, model, etc.
      };
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
      (req) => req.status === 'pending',
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

    this.logger.log(
      `🧹 [CLEANUP] Removed ${cleanedCount} old approval requests`,
    );
  }

  private generateStreamId(): string {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateApprovalId(): string {
    return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
