import type { CourseDetail, CourseSummary, GenerateCourseRequest } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail ?? response.statusText);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  listCourses: () => request<CourseSummary[]>("/api/courses"),
  getCourse: (courseId: number) => request<CourseDetail>(`/api/courses/${courseId}`),
  generateCourse: (body: GenerateCourseRequest) =>
    request<CourseDetail>("/api/courses/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  generateChapter: (chapterId: number, apiKey: string) =>
    request<import("./types").ChapterSummary>(`/api/chapters/${chapterId}/generate`, {
      method: "POST",
      body: JSON.stringify({ api_key: apiKey }),
    }),
  deleteCourse: (courseId: number) =>
    request<{ ok: boolean }>(`/api/courses/${courseId}`, { method: "DELETE" }),
  markChapterComplete: (chapterId: number) =>
    request<{ ok: boolean }>(`/api/chapters/${chapterId}/complete`, { method: "PATCH" }),
};
