export type CourseLevel = "beginner" | "intermediate" | "advanced";

export interface ExerciseItem {
  title: string;
  description: string;
}

export interface ChapterSummary {
  id: number;
  number: number;
  title: string;
  description: string;
  key_concepts: string[];
  has_diagram: boolean;
  completed: boolean;
  generated: boolean;
  explanation: string | null;
  diagram: string | null;
  real_world_example: string | null;
  exercises: ExerciseItem[];
  summary: string | null;
}

export interface SectionSummary {
  id: number;
  number: number;
  title: string;
  description: string;
  chapters: ChapterSummary[];
}

export interface CourseSummary {
  id: number;
  title: string;
  topic: string;
  level: string;
  total_sections: number;
  total_chapters: number;
  completed_chapters: number;
  created_at: string;
}

export interface CourseDetail {
  id: number;
  title: string;
  description: string;
  topic: string;
  level: string;
  created_at: string;
  sections: SectionSummary[];
}

export interface GenerateCourseRequest {
  api_key: string;
  topic: string;
  level: CourseLevel;
  num_sections: number;
  chapters_per_section: number;
}
