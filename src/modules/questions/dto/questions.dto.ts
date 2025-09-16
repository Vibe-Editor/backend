export class VideoTypeOptionDto {
  description: string;
  default_values: {
    subject_type: string;
    camera_movement: string;
    composition: string;
  };
  s3_key?: string;
}

export class VideoTypeSelectionDto {
  [key: string]: VideoTypeOptionDto;
}

export class QuestionOptionDto {
  label: string;
  value: string;
  s3_key: string;
}

export class QuestionDto {
  id: string;
  type: 'select' | 'multiselect' | 'text' | 'range';
  title: string;
  description?: string;
  options?: QuestionOptionDto[];
  s3_key?: string;
}

export class QuestionsDto {
  video_type_selection: VideoTypeSelectionDto;
  questions: QuestionDto[];
}
