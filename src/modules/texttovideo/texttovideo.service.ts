import { Injectable, Logger } from '@nestjs/common';
import { uploadVideoToS3 } from '../video-gen/s3/s3.service';
import { Subject, Observable } from 'rxjs';
import axios from 'axios';
import { PrismaClient } from '../../../generated/prisma';

export interface TextToVideoResult {
  s3_key: string;
  model: string;
  segmentId: string;
}

export interface ApprovalRequest {
  id: string;
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

interface WebInfoParams {
  prompt: string;
  projectId: string;
  userId: string;
}

@Injectable()
export class TextToVideoService {
  private readonly logger = new Logger(TextToVideoService.name);
  private readonly baseUrl = process.env.BASE_URL||"http://localhost:8080";
  private approvalRequests = new Map<string, ApprovalRequest>();
  private activeStreams = new Map<string, Subject<StreamMessage>>();
  private readonly prisma = new PrismaClient();

  // TEXT-TO-VIDEO WORKFLOW SYSTEM INSTRUCTIONS
  private readonly WORKFLOW_INSTRUCTIONS = `
    MANDATORY EXECUTION SEQUENCE - TEXT-TO-VIDEO WORKFLOW:
    1. 🔄 Execute get_web_info tool FIRST using user prompt
    2. 🔄 Execute concept_generation using web_info from step 1 + user prompt  
    3. 🔄 Execute segmentation using selected concept from step 2 + user prompt
    4. 🔄 Execute video_generation using selected script segments from step 3

    CRITICAL EXECUTION RULES:
    - IMMEDIATELY proceed to next step after each completion
    - Use output from previous steps as input for next steps
    - Concept generation MUST use web_info from step 1 as context
    - Segmentation MUST use selected concept from step 2 as input
    - Video generation MUST use selected script's animation prompts from step 3
    - All steps require approval before proceeding
    - Maintain data consistency: web_info → concepts → scripts → videos

    TOOL PARAMETER MAPPING:
    - get_web_info: Use user's prompt directly
    - concept_generation: Use prompt + web_info from step 1
    - segmentation: Use prompt + selected concept from step 2  
    - video_generation: Use segments with animation prompts from step 3
  `;

  // Validate workflow step execution against system instructions
  private validateWorkflowStep(step: string, input: any, streamSubject?: Subject<StreamMessage>): void {
    this.logger.log(`🔍 [WORKFLOW-VALIDATION] Validating step: ${step}`);
    
    if (streamSubject) {
      streamSubject.next({
        type: 'log',
        data: { message: `🔍 SYSTEM VALIDATION: Checking step ${step} against workflow instructions` },
        timestamp: new Date(),
      });
    }
    
    switch (step) {
      case 'web_info':
        if (!input.prompt) {
          throw new Error('WORKFLOW VIOLATION: web_info requires user prompt as per system instructions');
        }
        break;
        
      case 'concept_generation':
        if (!input.web_info) {
          throw new Error('WORKFLOW VIOLATION: concept_generation MUST use web_info from step 1 as per system instructions');
        }
        if (!input.prompt) {
          throw new Error('WORKFLOW VIOLATION: concept_generation requires user prompt as per system instructions');
        }
        break;
        
      case 'segmentation':
        if (!input.concept) {
          throw new Error('WORKFLOW VIOLATION: segmentation MUST use selected concept from step 2 as per system instructions');
        }
        if (!input.prompt) {
          throw new Error('WORKFLOW VIOLATION: segmentation requires user prompt as per system instructions');
        }
        break;
        
      case 'video_generation':
        if (!input.segments || !Array.isArray(input.segments) || input.segments.length === 0) {
          throw new Error('WORKFLOW VIOLATION: video_generation MUST use selected script segments from step 3 as per system instructions');
        }
        // Validate segments have animation prompts
        const segmentsWithoutPrompts = input.segments.filter(seg => 
          !seg.animation_prompt && !seg.animationPrompt && !seg.text_prompt
        );
        if (segmentsWithoutPrompts.length > 0) {
          this.logger.warn(`⚠️ [WORKFLOW-VALIDATION] ${segmentsWithoutPrompts.length} segments missing animation prompts - may violate system instructions`);
          if (streamSubject) {
            streamSubject.next({
              type: 'log',
              data: { message: `⚠️ SYSTEM WARNING: ${segmentsWithoutPrompts.length} segments missing animation prompts` },
              timestamp: new Date(),
            });
          }
        }
        break;
        
      default:
        this.logger.warn(`⚠️ [WORKFLOW-VALIDATION] Unknown step: ${step}`);
    }
    
    this.logger.log(`✅ [WORKFLOW-VALIDATION] Step ${step} validated successfully`);
    
    if (streamSubject) {
      streamSubject.next({
        type: 'log',
        data: { message: `✅ SYSTEM VALIDATION: Step ${step} passed all workflow instruction checks` },
        timestamp: new Date(),
      });
    }
  }

  async generateTextToVideo(
    segmentId: string,
    textPrompt: string,
    artStyle: string,
    projectId: string,
    model: string = 'fal-ai/veo-3',
  ): Promise<TextToVideoResult> {
    const startTime = Date.now();
    this.logger.log(`Starting text-to-video generation for segment: ${segmentId}`);
    this.logger.log(`Using model: ${model}`);

    try {
      this.logger.log('Starting Veo3 text-to-video generation with Fal.ai');

      const prompt = `${textPrompt}. Art style: ${artStyle}`;
      this.logger.log(`Combined prompt: ${prompt}`);

      const response = await fetch('https://fal.run/fal-ai/veo3', {
        method: 'POST',
        headers: {
          Authorization: `Key ${process.env.FAL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          aspect_ratio: '16:9',
          duration: '8s',
          resolution: '720p',
          generate_audio: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Fal.ai API error: ${response.status} - ${errorText}`);
        throw new Error(`Fal.ai API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as { video?: { url?: string } };
      this.logger.log('Veo3 text-to-video generation completed, processing result');

      if (!result.video?.url) {
        this.logger.error('Veo3 generation failed - no video URL returned');
        throw new Error('Veo3 video generation failed - no video URL returned');
      }

      this.logger.log(`Veo3 video URL: ${result.video.url}`);

      this.logger.log('Uploading Veo3 video to S3');
      const s3Key = await uploadVideoToS3(result.video.url, segmentId, projectId);
      this.logger.log(`Successfully uploaded Veo3 video to S3: ${s3Key}`);

      const totalTime = Date.now() - startTime;
      this.logger.log(
        `Veo3 text-to-video generation completed successfully in ${totalTime}ms`,
        {
          s3Key,
          segmentId,
          model,
        },
      );

      return {
        s3_key: s3Key,
        model: 'veo3',
        segmentId,
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.logger.error(
        `Veo3 text-to-video generation failed after ${totalTime}ms: ${error.message}`,
      );
      throw error;
    }
  }

  async startTextToVideoWorkflowStream(
    userInput: string,
    userId: string,
    authToken?: string,
    segmentId?: string,
    projectId?: string,
  ): Promise<Observable<StreamMessage>> {
    const streamId = this.generateStreamId();
    const streamSubject = new Subject<StreamMessage>();
    this.activeStreams.set(streamId, streamSubject);

    const cleanAuthToken = authToken
      ? authToken.replace(/^Bearer\s+/i, '').trim()
      : undefined;

    this.logger.log(`🔐 [AUTH] Original token: ${authToken ? 'present' : 'missing'}`);
    this.logger.log(`🔐 [AUTH] Cleaned token: ${cleanAuthToken ? 'present' : 'missing'}`);

    void this.runWorkflowWithStreaming(
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

  private async runWorkflowWithStreaming(
    userInput: string,
    userId: string,
    streamSubject: Subject<StreamMessage>,
    streamId: string,
    cleanAuthToken?: string,
    segmentId?: string,
    projectId?: string,
  ) {
    try {
      this.logger.log(`🚀 [WORKFLOW] start userId=${userId} projectId=${projectId}`);
      
      // Log system instructions for this workflow execution
      this.logger.log(`📋 [WORKFLOW] Executing with system instructions: ${this.WORKFLOW_INSTRUCTIONS.substring(0, 100)}...`);
      
      streamSubject.next({
        type: 'log',
        data: { 
          message: 'Starting text-to-video workflow with mandatory execution sequence...',
          systemInstructions: 'Following 4-step sequence: web_info → concepts → scripts → videos'
        },
        timestamp: new Date(),
      });

      // Step 1: Get Web Info
      streamSubject.next({
        type: 'log',
        data: { message: 'Step 1: Gathering web information...' },
        timestamp: new Date(),
      });

      // ACTIVE VALIDATION: Validate step 1 against system instructions
      this.validateWorkflowStep('web_info', { prompt: userInput }, streamSubject);

      const webInfo = await this.getWebInfo(
        {
          prompt: userInput,
          projectId: projectId || 'default',
          userId,
        },
        cleanAuthToken,
      );

      streamSubject.next({
        type: 'result',
        data: { step: 'web_info', result: webInfo },
        timestamp: new Date(),
      });

      // Step 2: Generate Concepts (with approval)
      const webInfoData = (webInfo as any).choices?.[0]?.message?.content || JSON.stringify(webInfo);
      this.logger.log(`🔄 [WORKFLOW] Step 1→2: Passing web_info (${webInfoData.length} chars) to concept generation`);
      
      const conceptApprovalId = this.generateApprovalId();
      const conceptRequest: ApprovalRequest = {
        id: conceptApprovalId,
        toolName: 'generate_concepts_with_approval',
        arguments: {
          prompt: userInput,
          web_info: webInfoData,
          projectId: projectId || 'default',
          userId,
        },
        status: 'pending',
        timestamp: new Date(),
        authToken: cleanAuthToken,
      };

      this.approvalRequests.set(conceptApprovalId, conceptRequest);

      streamSubject.next({
        type: 'approval_required',
        data: {
          approvalId: conceptApprovalId,
          toolName: 'generate_concepts_with_approval',
          arguments: conceptRequest.arguments,
          step: 'concept_generation',
        },
        timestamp: new Date(),
      });

      await this.waitForApproval(conceptApprovalId, streamSubject);

      if (this.approvalRequests.get(conceptApprovalId)?.status !== 'approved') {
        streamSubject.next({
          type: 'error',
          data: { message: 'Concept generation was rejected' },
          timestamp: new Date(),
        });
        return;
      }

      const conceptResult = await this.executeConceptGeneration(
        conceptRequest,
        streamSubject,
      );

      // Step 3: Generate Segmentation (with approval)
      const selectedConcept = (conceptResult as any).data?.selectedConcept?.description || 
                             (conceptResult as any).data?.selectedConcept?.title || 
                             'Default concept for video creation';
      this.logger.log(`🔄 [WORKFLOW] Step 2→3: Passing selected concept "${selectedConcept.substring(0, 50)}..." to segmentation`);
      
      const segmentationApprovalId = this.generateApprovalId();
      const segmentationRequest: ApprovalRequest = {
        id: segmentationApprovalId,
        toolName: 'generate_segmentation',
        arguments: {
          prompt: userInput,
          concept_id: (conceptResult as any).data?.selectedConcept?.id || 'concept-1',
          concept: selectedConcept,
          negative_prompt: '',
          projectId: projectId || 'default',
          model: 'flash',
        },
        status: 'pending',
        timestamp: new Date(),
        authToken: cleanAuthToken,
      };

      this.approvalRequests.set(segmentationApprovalId, segmentationRequest);

      streamSubject.next({
        type: 'approval_required',
        data: {
          approvalId: segmentationApprovalId,
          toolName: 'generate_segmentation',
          arguments: segmentationRequest.arguments,
          step: 'segmentation',
        },
        timestamp: new Date(),
      });

      await this.waitForApproval(segmentationApprovalId, streamSubject);

      if (
        this.approvalRequests.get(segmentationApprovalId)?.status !== 'approved'
      ) {
        streamSubject.next({
          type: 'error',
          data: { message: 'Segmentation was rejected' },
          timestamp: new Date(),
        });
        return;
      }

      const segmentationResult = await this.executeSegmentation(
        segmentationRequest,
        streamSubject,
      );

      // Step 4: Generate Video Directly (with approval) - Skip image generation
      const selectedScript = (segmentationResult as any).data.selectedScript || 
                             (segmentationResult as any).data.scripts?.[0];
      const scriptSegments = selectedScript?.segments || (segmentationResult as any).data.segments || [];
      
      this.logger.log(`🔄 [WORKFLOW] Step 3→4: Passing selected script "${selectedScript?.title || 'Main Script'}" with ${scriptSegments.length} segments to video generation`);
      
      const videoApprovalId = this.generateApprovalId();
      const videoRequest: ApprovalRequest = {
        id: videoApprovalId,
        toolName: 'generate_video_with_approval',
        arguments: {
          segments: scriptSegments.map(
            (seg: any) => ({
              id: seg.id,
              animation_prompt: seg.animation_prompt || seg.animation || seg.visual_prompt || seg.text_prompt || 'Create a video',
              text_prompt: seg.text_prompt || seg.prompt || 'Video content',
              visual_prompt: seg.visual_prompt || seg.visual || 'Visual content',
              narration: seg.narration || 'No narration',
              duration: seg.duration || '5 seconds'
            }),
          ),
          art_style: (segmentationResult as any).data.selectedScript?.artStyle || 
                     (segmentationResult as any).data.scripts?.[0]?.artStyle || 
                     'realistic',
          projectId: projectId || 'default',
          userId: userId, // Add userId for database storage
          model: 'fal-ai/veo-3',
          selectedScript: (segmentationResult as any).data.selectedScript || 
                         (segmentationResult as any).data.scripts?.[0] || null,
        },
        status: 'pending',
        timestamp: new Date(),
        authToken: cleanAuthToken,
      };

      this.approvalRequests.set(videoApprovalId, videoRequest);

      streamSubject.next({
        type: 'approval_required',
        data: {
          approvalId: videoApprovalId,
          toolName: 'generate_video_with_approval',
          arguments: videoRequest.arguments,
          step: 'video_generation',
        },
        timestamp: new Date(),
      });

      await this.waitForApproval(videoApprovalId, streamSubject);

      if (this.approvalRequests.get(videoApprovalId)?.status !== 'approved') {
        streamSubject.next({
          type: 'error',
          data: { message: 'Video generation was rejected' },
          timestamp: new Date(),
        });
        return;
      }

      const videoResult = await this.executeVideoGeneration(
        videoRequest,
        streamSubject,
      );

      streamSubject.next({
        type: 'completed',
        data: {
          finalOutput: videoResult,
          message: 'Text-to-video workflow completed successfully',
        },
        timestamp: new Date(),
      });
    } catch (error: any) {
      this.logger.error(`❌ [WORKFLOW] Error: ${error.message}`);
      streamSubject.next({
        type: 'error',
        data: { message: error.message },
        timestamp: new Date(),
      });
    } finally {
      this.activeStreams.delete(streamId);
      streamSubject.complete();
    }
  }

  private async getWebInfo(
    params: WebInfoParams,
    authToken?: string,
  ): Promise<any> {
    try {
      this.logger.log(
        `➡️ [WEB-INFO] POST /get-web-info projectId=${params.projectId}`,
      );
      
      if (!authToken) {
        throw new Error('Authentication token is required for web-info request');
      }

      const headers: any = {
        'Content-Type': 'application/json',
      };

      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      this.logger.log(`[WEB-INFO] Using auth token: ${authToken ? 'present' : 'missing'}`);

      const response = await axios.post(
        `${this.baseUrl}/get-web-info`,
        params,
        { headers },
      );
      this.logger.log(`✅ [WEB-INFO] ${response.status} OK`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`❌ [WEB-INFO] Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`❌ [WEB-INFO] Response status: ${error.response.status}`);
        this.logger.error(`❌ [WEB-INFO] Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to get web info: ${error.message}`);
    }
  }

  private async executeConceptGeneration(
    approvalRequest: ApprovalRequest,
    streamSubject: Subject<StreamMessage>,
  ): Promise<any> {
    try {
      const { arguments: args, authToken } = approvalRequest;
      
      // Parse args exactly like the agent module does
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
      const { prompt, web_info, projectId, userId } = parsedArgs;

      // ACTIVE VALIDATION: Validate step 2 against system instructions
      this.validateWorkflowStep('concept_generation', { prompt, web_info }, streamSubject);

      streamSubject.next({
        type: 'log',
        data: { message: 'Generating concepts using web research data...' },
        timestamp: new Date(),
      });

      if (!authToken) {
        throw new Error('Authentication token is missing from approval request');
      }

      // Call the actual concept-writer endpoint like the agent module does
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

      this.logger.log(`✅ [CONCEPT-WRITER] ${response.status} OK - Generated ${response.data.concepts?.length || 0} concepts`);
      
      // Log detailed concept information like the agent module
      if (response.data.concepts) {
        streamSubject.next({
          type: 'result',
          data: {
            step: 'concept_generation',
            totalConcepts: response.data.concepts.length,
            concepts: response.data.concepts.map((concept, index) => ({
              id: concept.id || `concept-${index + 1}`,
              title: concept.title || concept.name || `Concept ${index + 1}`,
              description: concept.concept || concept.description || concept.summary || 'No description',
              tone: concept.tone || 'Not specified',
              goal: concept.goal || 'Not specified'
            })),
            selectedConcept: response.data.selectedConcept || response.data.concepts[0],
            message: `Generated ${response.data.concepts.length} creative concepts`
          },
          timestamp: new Date(),
        });
      }
      
      return {
        success: true,
        data: response.data,
        message: 'Concepts generated successfully',
      };
    } catch (error: any) {
      this.logger.error(`❌ [CONCEPT] Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`❌ [CONCEPT] Response status: ${error.response.status}`);
        this.logger.error(`❌ [CONCEPT] Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to generate concepts: ${error.message}`);
    }
  }

  private async executeSegmentation(
    approvalRequest: ApprovalRequest,
    streamSubject: Subject<StreamMessage>,
  ): Promise<any> {
    try {
      const { arguments: args, authToken } = approvalRequest;
      
      // Parse args exactly like the agent module does
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
      const {
        prompt,
        concept_id,
        concept,
        negative_prompt,
        projectId,
        model,
      } = parsedArgs;

      // ACTIVE VALIDATION: Validate step 3 against system instructions
      this.validateWorkflowStep('segmentation', { prompt, concept }, streamSubject);

      streamSubject.next({
        type: 'log',
        data: { message: 'Generating script segmentation using selected concept...' },
        timestamp: new Date(),
      });

      if (!authToken) {
        throw new Error('Authentication token is missing from approval request');
      }

      try {
        this.logger.log(`➡️ [SEGMENTATION] Generating 2 script alternatives for projectId=${projectId}`);
        console.log(parsedArgs);

        // Generate 2 scripts like the chat widget does
        const [script1Response, script2Response] = await Promise.all([
          // Script 1: Normal approach
          axios.post(
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
          ),
          // Script 2: Alternative approach
          axios.post(
            `${this.baseUrl}/segmentation`,
            {
              prompt: `${prompt} (alternative approach)`,
              concept,
              negative_prompt: negative_prompt || 'avoid repetition, be creative',
              projectId,
              model,
            },
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
                'Content-Type': 'application/json',
              },
            },
          ),
        ]);

        this.logger.log(`✅ [SEGMENTATION] Generated 2 scripts:`);
        this.logger.log(`   Script 1: ${script1Response.data.segments?.length || 0} segments`);
        this.logger.log(`   Script 2: ${script2Response.data.segments?.length || 0} segments`);
        
        // Log detailed segmentation information for both scripts
        streamSubject.next({
          type: 'result',
          data: {
            step: 'segmentation',
            totalScripts: 2,
            scripts: [
              {
                id: 'script-1',
                title: 'Main Script',
                totalSegments: script1Response.data.segments?.length || 0,
                segments: script1Response.data.segments?.map((segment, index) => ({
                  id: segment.id || `script1-segment-${index + 1}`,
                  narration: segment.narration || 'No narration',
                  textPrompt: segment.text_prompt || segment.prompt || 'No text prompt',
                  visualPrompt: segment.visual_prompt || segment.visual || segment.animation || 'No visual prompt',
                  animationPrompt: segment.animation_prompt || segment.animation || segment.visual || segment.text_prompt || 'No animation prompt',
                  duration: segment.duration || 'Not specified'
                })) || [],
                summary: script1Response.data.summary || 'Main script completed',
                artStyle: script1Response.data.artStyle || 'Not specified'
              },
              {
                id: 'script-2',
                title: 'Alternative Script',
                totalSegments: script2Response.data.segments?.length || 0,
                segments: script2Response.data.segments?.map((segment, index) => ({
                  id: segment.id || `script2-segment-${index + 1}`,
                  narration: segment.narration || 'No narration',
                  textPrompt: segment.text_prompt || segment.prompt || 'No text prompt',
                  visualPrompt: segment.visual_prompt || segment.visual || segment.animation || 'No visual prompt',
                  animationPrompt: segment.animation_prompt || segment.animation || segment.visual || segment.text_prompt || 'No animation prompt',
                  duration: segment.duration || 'Not specified'
                })) || [],
                summary: script2Response.data.summary || 'Alternative script completed',
                artStyle: script2Response.data.artStyle || 'Not specified'
              }
            ],
            selectedScript: script1Response.data, // Default to first script
            message: `Generated 2 scripts with ${script1Response.data.segments?.length || 0} and ${script2Response.data.segments?.length || 0} segments respectively`
          },
          timestamp: new Date(),
        });
        
        return {
          success: true,
          data: {
            scripts: [script1Response.data, script2Response.data],
            selectedScript: script1Response.data,
            totalScripts: 2
          },
          concept_id,
          message: 'Script segmentation completed successfully - 2 alternatives generated',
        };
      } catch (error) {
        console.log(error);
        this.logger.error(`❌ [SEGMENTATION] Error: ${error.message}`);
        throw new Error(`Failed to generate segmentation: ${error.message}`);
      }
    } catch (error: any) {
      this.logger.error(`❌ [SEGMENTATION] Error: ${error.message}`);
      throw new Error(`Failed to generate segmentation: ${error.message}`);
    }
  }

  private async executeVideoGeneration(
    approvalRequest: ApprovalRequest,
    streamSubject: Subject<StreamMessage>,
  ): Promise<any> {
    try {
      const { arguments: args, authToken } = approvalRequest;
      
      // Parse args like the agent module does
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
      const {
        segments,
        art_style,
        projectId,
        userId,
        model,
        isRetry = false,
        retrySegmentIds = [],
      } = parsedArgs;

      // ACTIVE VALIDATION: Validate step 4 against system instructions
      this.validateWorkflowStep('video_generation', { segments }, streamSubject);

      const totalSegments = segments?.length || 0;
      
      streamSubject.next({
        type: 'log',
        data: {
          message: isRetry
            ? `Retrying video generation for ${totalSegments} segments using selected script...`
            : `Generating videos for ${totalSegments} segments using selected script...`,
        },
        timestamp: new Date(),
      });

      if (!authToken) {
        throw new Error('Authentication token is missing from approval request');
      }

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      // Log selected script information
      if (parsedArgs.selectedScript) {
        streamSubject.next({
          type: 'log',
          data: {
            message: `🎬 Using selected script: ${parsedArgs.selectedScript.title || 'Main Script'}`,
            scriptInfo: {
              title: parsedArgs.selectedScript.title || 'Main Script',
              summary: parsedArgs.selectedScript.summary || 'No summary',
              artStyle: parsedArgs.selectedScript.artStyle || art_style,
              totalSegments: segments?.length || 0
            }
          },
          timestamp: new Date(),
        });
      }

      // Generate videos using Veo3 text-to-video directly with selected script's animation prompts
      for (const segment of segments || []) {
        try {
          // ONLY use animation_prompt for Veo3 (not text_prompt or other prompts)
          const animationPrompt = segment.animation_prompt || segment.animationPrompt;
          
          if (!animationPrompt) {
            this.logger.warn(`⚠️ [VIDEO-GEN] Segment ${segment.id} missing animation_prompt - skipping`);
            streamSubject.next({
              type: 'log',
              data: {
                message: `⚠️ Skipping segment ${segment.id} - no animation prompt available`,
              },
              timestamp: new Date(),
            });
            continue;
          }
          
          streamSubject.next({
            type: 'log',
            data: {
              message: `🎬 Generating video for segment: ${segment.id}`,
              segmentInfo: {
                id: segment.id,
                animationPrompt: animationPrompt.substring(0, 100) + '...',
                narration: (segment.narration || 'No narration').substring(0, 50) + '...',
                duration: segment.duration || '5 seconds',
                veo3Input: 'Using ONLY animation_prompt for Veo3'
              }
            },
            timestamp: new Date(),
          });

          this.logger.log(`🎬 [VEO3] Sending animation prompt to Veo3: "${animationPrompt.substring(0, 100)}..."`);

          // Use the existing generateTextToVideo method with Veo3 - ONLY animation prompt
          const videoResult = await this.generateTextToVideo(
            segment.id || `segment-${Date.now()}`,
            animationPrompt, // ONLY animation prompt goes to Veo3
            art_style || 'realistic',
            projectId,
            'fal-ai/veo-3', // Force Veo3 model
          );

          // SAVE TO DATABASE - This was missing!
          this.logger.log(`💾 [DATABASE] Saving video to database for segment: ${segment.id}`);
          const savedVideo = await this.prisma.generatedVideo.create({
            data: {
              animationPrompt: animationPrompt,
              artStyle: art_style || 'realistic',
              imageS3Key: '', // No image for text-to-video
              uuid: segment.id || `segment-${Date.now()}`,
              success: true,
              model: 'fal-ai/veo-3',
              totalVideos: 1,
              projectId: projectId,
              userId: userId,
            },
          });

          // Save video file with S3 key
          if (videoResult.s3_key) {
            await this.prisma.generatedVideoFile.create({
              data: {
                s3Key: videoResult.s3_key,
                generatedVideoId: savedVideo.id,
              },
            });
            this.logger.log(`💾 [DATABASE] Saved video file with S3 key: ${videoResult.s3_key}`);
          }

          results.push({
            segmentId: segment.id,
            status: 'success',
            videoData: videoResult,
            segmentInfo: {
              animationPrompt,
              narration: segment.narration,
              duration: segment.duration
            }
          });
          successCount++;

          // Extract S3 keys from video result
          const s3Keys = [];
          if (videoResult.s3_key) {
            s3Keys.push(videoResult.s3_key);
          }

          streamSubject.next({
            type: 'result',
            data: {
              step: 'video_generation_segment',
              segmentId: segment.id,
              message: `🎬 Segment ${segment.id} video completed with Veo3`,
              videoData: videoResult,
              animationPrompt: animationPrompt.substring(0, 100) + '...',
              s3Keys: s3Keys,
              videoUrls: s3Keys.map(key => `https://s3.amazonaws.com/${key}`),
              veo3Model: 'fal-ai/veo-3',
              inputType: 'animation_prompt_only'
            },
            timestamp: new Date(),
          });

          this.logger.log(`✅ [VEO3] Video generated for segment ${segment.id}, S3 keys: ${s3Keys.join(', ')}`);
          
          if (s3Keys.length > 0) {
            streamSubject.next({
              type: 'log',
              data: {
                message: `📁 S3 Keys for segment ${segment.id}: ${s3Keys.join(', ')}`,
                s3Keys: s3Keys,
                videoUrls: s3Keys.map(key => `https://s3.amazonaws.com/${key}`)
              },
              timestamp: new Date(),
            });
          }
        } catch (error: any) {
          results.push({
            segmentId: segment.id,
            status: 'failed',
            error: error.message,
          });
          failureCount++;

          streamSubject.next({
            type: 'log',
            data: {
              message: `❌ Segment ${segment.id} video failed: ${error.message}`,
            },
            timestamp: new Date(),
          });
        }
      }

      return {
        success: failureCount === 0,
        totalSegments,
        successCount,
        failureCount,
        results,
        message: `Veo3 video generation completed: ${successCount} success, ${failureCount} failed`,
      };
    } catch (error: any) {
      this.logger.error(`❌ [VIDEO] Error: ${error.message}`);
      throw new Error(`Failed to generate videos: ${error.message}`);
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
          setTimeout(checkApproval, 1000);
        }
      };
      checkApproval();
    });
  }

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
        ...additionalData,
      };
    }

    approvalRequest.status = approved ? 'approved' : 'rejected';

    return {
      status: 'success',
      message: `Request ${approved ? 'approved' : 'rejected'} successfully`,
    };
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvalRequests.values()).filter(
      (req) => req.status === 'pending',
    );
  }

  getApprovalRequest(approvalId: string): ApprovalRequest | undefined {
    return this.approvalRequests.get(approvalId);
  }

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
