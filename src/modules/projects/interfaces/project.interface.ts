export interface ProjectResponse {
  id: string;
  name: string;
  description?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectWithStats extends ProjectResponse {
  _count: {
    conversations: number;
    videoConcepts: number;
    webResearchQueries: number;
    contentSummaries: number;
    videoSegmentations: number;
    generatedImages: number;
    generatedVideos: number;
    generatedVoiceovers: number;
  };
  workflowSteps?: string[] | null;
}
