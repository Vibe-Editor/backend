export interface TypeConcept {
  title: string;
  concept: string;
  tone: string;
  goal: string;
}

export interface GeneratedResponse {
  concepts: TypeConcept[];
  credits: {
    used: number;
    balance: number;
  };
}
