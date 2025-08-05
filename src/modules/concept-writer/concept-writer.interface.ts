export interface TypeConcept {
  title: string;
  concept: string;
  tone: string;
  goal: string;
}

export interface GeneratedResponse {
  input?: string;
  system_prompt?: string;
  concepts: TypeConcept[];
  credits: {
    used: number;
    balance: number;
  };
}
