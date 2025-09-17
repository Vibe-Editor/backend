export interface TypeSegment {
  id: string;
  narration: string;
  visual: string;
  animation: string;
  type?: string; // Add this line
  // No individual summary - combined summary is in the main response
}
