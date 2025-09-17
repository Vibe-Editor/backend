import { Injectable, Logger } from '@nestjs/common';
import { Agent, tool, run, RunState, RunResult, handoff } from '@openai/agents';
import { z } from 'zod';
import axios from 'axios';
import { Subject, Observable } from 'rxjs';
import { PrismaClient } from '@prisma/client';


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

interface ImageGenerationReqParam {
  id: string;
  visual_prompt: string;
  art_style: string;
  projectId: string;
}

interface ImageGenerationParsedArgs {
  segments: [];
  art_style: string;
  projectId: string;
  model: string;
}

interface VideoParamSegment {
  animation_prompt: string;
  imageS3Key: string;
  segmentId: string;
}

interface VideoGenerationParams {
  segment: VideoParamSegment[];
  projectId: string;
  art_style: string;
}

@Injectable()
export class AgentServiceV2 {
  private readonly logger = new Logger(AgentServiceV2.name);
  private readonly baseUrl = 'https://backend.usuals.ai';
  //  private readonly baseUrl = 'http://localhost:8080';
  private approvalRequests = new Map<string, ApprovalRequest>();
  private activeStreams = new Map<string, Subject<StreamMessage>>();

  // State tracking
  private projectStates = new Map<string, string[]>(); // projectId -> completed steps array


  private webResearchAgent: Agent;
  private conceptAgent: Agent;
  private imageAgent: Agent;
  private videoAgent: Agent;
  private routerAgent: Agent;
  private segmentationAgent: Agent;


  private readonly prisma = new PrismaClient();


  private async getProjectStateMessage(projectId: string): Promise<string> {
    let completedSteps
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { completedSteps: true }
      });

      completedSteps = project?.completedSteps || [];

    } catch (error) {

      this.logger.error(`Failed to fetch project state for ${projectId}: ${error.message}`);

    }


    // const completedSteps = this.projectStates.get(projectId) || [];

    const hasConceptGeneration = completedSteps.includes('concept_generation');
    const hasSegmentation = completedSteps.includes('segmentation');
    const hasImageGeneration = completedSteps.includes('image_generation');
    const hasVideoGeneration = completedSteps.includes('video_generation');

    if (!hasConceptGeneration) {
      return "STATE_MESSAGE: Project needs concept generation first. User cannot generate segments, images, or videos until concepts are created. kindly tell the user to generate those first!! If the user prompt asks for web search or anything research related then please call the websearch agent directly!!! Also if the user is asking for concept generation then please call concept generation agent immediately";
    }

    if (hasConceptGeneration && !hasSegmentation) {
      return "STATE_MESSAGE: Project has concepts but needs segmentation. User cannot generate images or videos until segments are created. so if user is demanding for images or video tell him he can't do that. If the user is asking of concept generation or segmentation generation then call the required tools";
    }


    return "STATE_MESSAGE: All steps completed. User can generate any content , please call the required tool/agent ";
  }

  private async updateProjectState(projectId: string, completedStep: string): Promise<void> {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { completedSteps: true }
      });

      const currentSteps = project?.completedSteps || [];

      if (!currentSteps.includes(completedStep)) {
        await this.prisma.project.update({
          where: { id: projectId },
          data: {
            completedSteps: {
              push: completedStep
            }
          }
        });

        this.logger.log(`📊 [STATE] Project ${projectId} completed step: ${completedStep}`);
      }
    } catch (error) {
      this.logger.error(`❌ [STATE] Failed to update project state: ${error.message}`);
    }
  }

  private async storeUserPrompt(projectId: string, userPrompt: string): Promise<void> {
  try {
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        userPrompts: {
          push: userPrompt
        }
      }
    });
    
    this.logger.log(`💬 [PROMPT] Stored user prompt for project ${projectId}`);
  } catch (error) {
    this.logger.error(`❌ [PROMPT] Failed to store user prompt: ${error.message}`);
  }
}


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

  // Video Generation Tool
  private createVideoGenerationTool(authToken?: string) {
    return tool({
      name: 'generate_video_with_approval',
      description:
        'Generate a video after getting user approval for the animation prompt and image',
      // @ts-ignore
      parameters: {
        type: 'object',
        properties: {
          segments: {
            type: 'array',
            description:
              'Array of segments with animation prompts and image data',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Segment ID' },
                animation_prompt: {
                  type: 'string',
                  description: 'Animation prompt for the segment',
                },
                imageS3Key: {
                  type: 'string',
                  description: 'S3 key of the image to animate',
                },
              },
              required: ['id', 'animation_prompt', 'imageS3Key'],
              additionalProperties: false,
            },
          },
          art_style: { type: 'string', description: 'Art style for the video' },
          projectId: { type: 'string', description: 'Project ID' },
          model: {
            type: 'string',
            description: 'Model to use for video generation',
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
            `➡️ [VIDEO] POST /video-gen model=${model} projectId=${projectId}`,
          );

          return {
            success: true,
            data: '',
            message: `Video generation complete`,
          };
        } catch (error) {
          this.logger.error(`❌ [VIDEO] Error: ${error.message}`);
          throw new Error(`Failed to generate video: ${error.message}`);
        }
      },
    });
  }

  // Create image generation tool with auth token
  private createImageGenerationTool(authToken?: string) {
    return tool({
      name: 'generate_image_with_approval',
      description:
        'Generate an image after getting user approval for the script',
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
        required: [
          'script',
          'art_style',
          'segmentId',
          'projectId',
          'userId',
          'model',
        ],
        additionalProperties: false,
      },
      needsApproval: true, // Always requires approval
      execute: async ({
        script,
        art_style,
        segmentId,
        projectId,
        userId,
        model,
      }: ImageGenerationParams) => {
        try {
          this.logger.log(
            `➡️ [IMAGE] POST /chat model=${model} projectId=${projectId}`,
          );
          // const response = await axios.post(`${this.baseUrl}/chat`, {
          //   model,
          //   gen_type: 'image',
          //   visual_prompt: script,
          //   art_style,
          //   segmentId,
          //   projectId,
          // }, {
          //   headers: {
          //     'Authorization': `Bearer ${authToken}`,
          //     'Content-Type': 'application/json',
          //   },
          // });
          // this.logger.log(`✅ [IMAGE] ${response.status} OK`);
          return {
            success: true,
            data: '',
            message: 'Image generation completed successfully',
          };
        } catch (error) {
          console.log(error);
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
      // @ts-ignore
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



  private async initializeAgents(authToken?: string) {
    // Create agent instances
    this.webResearchAgent = new Agent({
      name: 'Web Research Agent',
      instructions: `You are a specialized web research agent focused on gathering comprehensive, accurate information.

CORE RESPONSIBILITIES:
- Conduct thorough web research using the get_web_info tool
- Gather current data, trends, statistics, and factual information
- Provide comprehensive research reports with relevant context

RESEARCH APPROACH:
1. Analyze the user's research request to understand the scope and depth needed
2. Use get_web_info tool to gather information from multiple reliable sources
3. Focus on current, factual, and authoritative information
4. Look for trends, statistics, expert opinions, and recent developments
5. Provide well-structured research findings with source context

OUTPUT FORMAT:
- Present findings in a clear, organized manner
- Include key statistics, trends, and expert insights
- Highlight important developments and current state of the topic
- Provide actionable insights when relevant
- Always maintain objectivity and cite information sources

IMPORTANT: Only use the get_web_info tool. Do not attempt to generate concepts, images, or videos. Your role is purely research and information gathering.`,
      tools: [this.createGetWebInfoTool(authToken)]
    });

    this.conceptAgent = new Agent({
      name: 'Concept Generation Agent',
      instructions: `You are a creative concept generation specialist that creates innovative content concepts.

CORE RESPONSIBILITIES:
- Generate creative, unique concepts for various types of content
- Research background information when needed
- Create multiple concept options for user selection
- Ensure concepts are culturally appropriate and contextually relevant

WORKFLOW PROCESS:
1. RESEARCH PHASE:
   - Use get_web_info tool to gather background information
   - Research current trends, cultural context, and relevant examples
   - Understand the market landscape and audience expectations

2. CONCEPT GENERATION PHASE:
   - Use generate_concepts_with_approval tool to create concepts
   - Generate 4 distinct, creative concept options
   - Each concept should be unique and offer different creative directions
   - Include detailed descriptions, themes, and unique selling points
   - Consider target audience, cultural sensitivity, and market appeal

CONCEPT QUALITY STANDARDS:
- Original and innovative approaches
- Culturally authentic and respectful
- Market-viable and audience-appropriate
- Clear narrative structure and compelling themes
- Detailed enough for further development

IMPORTANT: Always research first, then generate concepts. Present concepts clearly with distinct creative directions for user selection.`,
      tools: [
        this.createGetWebInfoTool(authToken),
        this.createConceptWriterTool(authToken)
      ]
    });

    this.segmentationAgent = new Agent({
      name: 'Segmentation Agent',
      instructions: `You are a script segmentation specialist that breaks down content into detailed production segments.

CORE RESPONSIBILITIES:
- Transform concepts and scripts into detailed production segments
- Create comprehensive scene breakdowns for visual content
- Define timing, pacing, transitions, and technical specifications
- Prepare content for image/video production pipelines

SEGMENTATION PROCESS:
1. CONTENT ANALYSIS:
   - Analyze the input concept, script, or narrative
   - Identify key story beats, scenes, and visual moments
   - Determine optimal segment breakdown for production

2. DETAILED SEGMENTATION:
   - Use generate_segmentation tool to create production-ready segments
   - Include visual descriptions, camera angles, and composition details
   - Specify artistic style, mood, and technical requirements
   - Define animation prompts and motion specifications
   - Add timing and transition information

SEGMENTATION STANDARDS:
- Clear, actionable segment descriptions
- Consistent artistic vision across all segments
- Technical specifications for production teams
- Cultural authenticity and sensitivity when applicable
- Optimal pacing and narrative flow

OUTPUT FORMAT:
- Numbered segments with clear boundaries
- Detailed visual descriptions for each segment
- Animation/motion prompts where applicable
- Technical specifications (shots, angles, lighting)
- Style and mood consistency guidelines

IMPORTANT: Focus purely on segmentation. Do not generate images or videos - prepare detailed specifications for other agents to execute.`,
      tools: [this.createSegmentationTool(authToken)]
    });

    // Updated image agent (no segmentation tool)
    this.imageAgent = new Agent({
      name: 'Image Generation Agent',
      instructions: `You are an image generation specialist that creates visual content from detailed segment specifications.

CORE RESPONSIBILITIES:
- Generate high-quality images based on detailed segment specifications
- Ensure visual consistency and artistic coherence
- Transform segment descriptions into stunning visual content

WORKFLOW PROCESS:
- Use generate_image_with_approval tool to create visuals for provided segments
- Follow the artistic style and mood defined in segment specifications
- Ensure visual consistency across all generated images
- Match technical requirements (camera angles, lighting, composition)

VISUAL QUALITY STANDARDS:
- High artistic quality and technical execution
- Consistent visual style across all segments
- Accurate representation of segment requirements
- Appropriate composition, lighting, and visual elements
- Cultural authenticity and sensitivity when applicable

IMPORTANT: You work with pre-segmented content. Focus purely on creating high-quality images that match the provided segment specifications.`,
      tools: [this.createImageGenerationTool(authToken)]
    });

    // Updated video agent (no segmentation tool)
    this.videoAgent = new Agent({
      name: 'Video Generation Agent',
      instructions: `You are a video animation specialist that creates videos from images and segment specifications.

CORE RESPONSIBILITIES:
- Animate provided images based on segment specifications
- Create smooth video transitions and camera movements
- Ensure narrative flow and professional video quality

WORKFLOW PROCESS:
1. INITIATE VIDEO GENERATION:
   - Call generate_video_with_approval tool immediately when user requests video creation
   - The tool will request approval and wait for the user to provide:
     * Image segments with S3 keys
     * Animation prompts for each segment
     * Art style specifications
     * Model preferences
     * Project details

2. POST-APPROVAL EXECUTION:
   - Once approval is received with all required parameters, execute video generation
   - Apply animation prompts and motion specifications from provided segments
   - Ensure smooth transitions between video segments
   - Maintain narrative flow and pacing throughout the video

PRODUCTION QUALITY STANDARDS:
- Cinematic quality and professional execution
- Smooth narrative flow with appropriate pacing
- High-quality animation with dynamic camera work
- Cultural authenticity and sensitivity when applicable
- Technical excellence in video production

IMPORTANT: Do not wait for images or segments to be provided upfront. Call the video generation tool immediately - the approval process will handle collecting all necessary parameters (images, segments, animation prompts, etc.) from the user.`,
      tools: [this.createVideoGenerationTool(authToken)]
    });

    // Updated router agent with segmentation route
    const routeToWebResearch = handoff(this.webResearchAgent);
    const routeToConcept = handoff(this.conceptAgent);
    const routeToSegmentation = handoff(this.segmentationAgent);
    const routeToImage = handoff(this.imageAgent);
    const routeToVideo = handoff(this.videoAgent);


    // Router agent with handoffs

    this.routerAgent = new Agent({
      name: 'Router',
      instructions: `You are an intelligent router for a content creation system. Analyze user input and route to the appropriate specialized agent based on their intent and keywords.

ROUTING DECISION TREE:

💡 CONCEPT GENERATION AGENT (routeToConcept)  
Route when user wants:
- Creative concepts, brainstorming, idea generation
- Content strategy, themes, storylines
- Multiple concept options to choose from
- Keywords: "concepts", "ideas", "brainstorm", "creative", "themes", "storyline", "concept for", "generate ideas", "think of concepts", "brainstorm some", "creative concepts"
- Examples: "generate concepts for a cooking show", "brainstorm ideas for marketing campaign", "create concepts about space exploration"

📝 SEGMENTATION AGENT (routeToSegmentation)
Route when user wants:
- Script breakdown, scene segmentation, story beats
- Content structure, production planning
- Segment content for further production
- Keywords: "segment", "break down", "script breakdown", "scene breakdown", "story beats", "structure", "segments", "divide", "break into parts", "production planning"
- Examples: "segment this script", "break down this story", "create story beats for this concept", "structure this content"

🎨 IMAGE GENERATION AGENT (routeToImage)
Route when user wants:
- Visual content, pictures, graphics, artwork
- Image creation from descriptions or segments
- Visual representations of ideas
- Keywords: "image", "picture", "visual", "create image", "generate image", "make a picture", "draw", "illustration", "artwork", "graphic", "photo", "render"
- Examples: "create an image of a sunset", "generate a picture of a robot", "make visuals for my presentation"

🎬 VIDEO GENERATION AGENT (routeToVideo) 
Route when user wants:
- Video content, animations, moving pictures
- Video animation from images
- Animated sequences, video clips
- Keywords: "video", "animate", "animation", "movie", "clip", "create video", "generate video", "make a video", "film", "motion", "animated", "cinematics"
- Examples: "create a video about cooking", "animate this story", "make a promotional video"

ROUTING LOGIC:
1. Look for PRIMARY intent keywords first
2. If multiple intents detected, prioritize in this order: Video > Image > Segmentation > Concept > Web Research
3. If intent is unclear, default to Web Research (safest option)
4. ALWAYS route immediately - do not attempt to do the work yourself
5. Include the full user prompt when routing

ROUTING EXAMPLES:
- "I want to make a cooking video" → routeToVideo
- "Find me information about sustainable cooking" → routeToWebResearch  
- "Generate some creative concepts for a cooking show" → routeToConcept
- "Create an image of a chef cooking pasta" → routeToImage
- "Segment this script into story beats" → routeToSegmentation
- "Break down this concept into production segments" → routeToSegmentation
- "Research and then create concepts about Italian cuisine" → routeToWebResearch (start with research)
- "Make me a video and some images about pizza" → routeToVideo (video takes priority)

IMPORTANT: Look into the StateMessage and Route IMMEDIATELY upon receiving user input if statemessage agress with the tool call is requested in user prompt. Do not provide explanations or summaries - just route to the appropriate agent.`,
      handoffs: [routeToConcept, routeToSegmentation, routeToImage, routeToVideo]
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

      await this.storeUserPrompt(projectId || 'default', userInput);

      streamSubject.next({
        type: 'log',
        data: { message: 'Starting agent run...' },
        timestamp: new Date(),
      });

      await this.initializeAgents(authToken);


      const agent = this.routerAgent;

      const stateMessage = await this.getProjectStateMessage(projectId || 'default');

      console.log(this.projectStates)

      // Add user context to the input (don't include auth token - it's handled internally)
      const contextualInput = `${userInput}\n  stateMessage: ${stateMessage} \n\nUser ID: ${userId}\nSegment ID: ${segmentId || 'default'}\nProject ID: ${projectId || 'default'}`;

      console.log(contextualInput)

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

      if (toolName === 'generate_image_with_approval') {
        const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
        const {
          segments,
          art_style,
          projectId,
          model,
          isRetry = false,
          retrySegmentIds = [],
        } = parsedArgs;

        // console.log({ "segment": segments, "art_style": art_style, "projectId": projectId, "model": model, "is retry": isRetry, "restly id?": retrySegmentIds })
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
              ? `Retrying image generation for ${totalSegments} segments...`
              : `Generating images for ${totalSegments} segments...`,
          },
          timestamp: new Date(),
        });

        if (!authToken) {
          throw new Error(
            'Authentication token is missing from approval request',
          );
        }

        // Create all promises for parallel processing
        const segmentPromises = segmentsToProcess.map((segment, index) => {
          return axios
            .post(
              `${this.baseUrl}/chat`,
              {
                model,
                gen_type: 'image',
                visual_prompt: segment.visual,
                art_style,
                segmentId: segment.id,
                projectId,
              },
              {
                headers: {
                  Authorization: `Bearer ${authToken}`,
                  'Content-Type': 'application/json',
                },
              },
            )
            .then((response) => {
              console.log('RESPONSE DATA IS HERE', response.data);

              const result = {
                segmentId: segment.id,
                status: 'success',
                imageData: response.data,
              };

              // Stream success immediately when this segment completes
              streamSubject.next({
                type: 'log',
                data: {
                  segmentId: segment.id,
                  message: `✅ Segment ${segment.id} completed successfully`,
                  ImageData: response.data,
                },
                timestamp: new Date(),
              });

              return result;
            })
            .catch((error) => {
              console.log(error);
              const result = {
                segmentId: segment.id,
                status: 'failed',
                error: error.message,
              };

              // Stream failure immediately when this segment fails
              streamSubject.next({
                type: 'log',
                data: {
                  message: `❌ Segment ${segment.id} failed: ${error.message}`,
                },
                timestamp: new Date(),
              });

              this.logger.error(
                `❌ [IMAGE] Segment ${segment.id} failed: ${error.message}`,
              );
              return result;
            });
        });

        // Wait for all promises to complete and collect results
        const settledResults = await Promise.allSettled(segmentPromises);

        settledResults.forEach((settledResult) => {
          if (settledResult.status === 'fulfilled') {
            const result = settledResult.value;
            results.push(result);

            if (result.status === 'success') {
              successCount++;
            } else {
              failureCount++;
            }
          } else {
            // This shouldn't happen since we handle errors in the promise chain
            // but just in case...
            const result = {
              segmentId: 'unknown',
              status: 'failed',
              error: settledResult.reason,
            };
            results.push(result);
            failureCount++;
          }
        });

        const finalMessage = `Image generation ${isRetry ? 'retry' : ''} completed: ${successCount} success, ${failureCount} failed`;

        streamSubject.next({
          type: 'log',
          data: { message: finalMessage },
          timestamp: new Date(),
        });

        this.updateProjectState(projectId, 'image_generation');

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

      if (toolName === 'generate_video_with_approval') {
        const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
        const {
          segments,
          art_style,
          projectId,
          model,
          isRetry = false,
          retrySegmentIds = [],
        } = parsedArgs;

        console.log(segments, art_style, projectId);

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
              ? `Retrying video generation for ${totalSegments} segments...`
              : `Generating videos for ${totalSegments} segments...`,
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
            let response;

            if (model === 'veo3') {
              // Use text-to-video endpoint for veo3 model
              response = await axios.post(
                `${this.baseUrl}/texttovideo`,
                {
                  text_prompt: segment.animation_prompt,
                  art_style: art_style,
                  segmentId: segment.id,
                  projectId: projectId,
                  model: model,
                },
                {
                  headers: {
                    Authorization: `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                  },
                },
              );

              this.logger.log(`✅ [TEXT-TO-VIDEO] Segment ${segment.id} - ${response.status} OK`);
            } else {
              // Use chat endpoint for other models (existing logic)
              response = await axios.post(
                `${this.baseUrl}/chat`,
                {
                  gen_type: 'video',
                  animation_prompt: segment.animation_prompt,
                  art_style: art_style,
                  model: model,
                  image_s3_key: segment.imageS3Key,
                  segmentId: segment.id,
                  projectId: projectId,
                },
                {
                  headers: {
                    Authorization: `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                  },
                },
              );

              this.logger.log(`✅ [CHAT-VIDEO] Segment ${segment.id} - ${response.status} OK`);
            }


            console.log('VIDEO RESPONSE DATA IS HERE', response.data);
            const result = {
              segmentId: segment.id,
              status: 'success',
              videoData: response.data,
            };

            results.push(result);
            successCount++;

            // Stream success immediately when this segment completes
            streamSubject.next({
              type: 'log',
              data: {
                segmentId: segment.id,
                message: `🎬 Segment ${segment.id} video completed successfully`,
                VideoData: response.data,
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
                message: `❌ Segment ${segment.id} video failed: ${error.message}`,
              },
              timestamp: new Date(),
            });

            this.logger.error(
              `❌ [VIDEO] Segment ${segment.id} failed: ${error.message}`,
            );
          }
        }

        const finalMessage = `Video generation ${isRetry ? 'retry' : ''} completed: ${successCount} success, ${failureCount} failed`;

        streamSubject.next({
          type: 'log',
          data: { message: finalMessage },
          timestamp: new Date(),
        });

        this.updateProjectState(projectId, 'video_generation');

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

        // updates the project id map for the state info
        this.updateProjectState(projectId, 'concept_generation');
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

          // this updates the state for the segmentation
          this.updateProjectState(parsedArgs.projectId, 'segmentation');
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
      console.log(error)
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
