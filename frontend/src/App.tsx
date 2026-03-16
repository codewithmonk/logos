import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ThemeProvider } from "./theme";
import { CourseGeneratePage } from "./pages/CourseGeneratePage";
import { CourseLibraryPage } from "./pages/CourseLibraryPage";
import { CourseViewPage } from "./pages/CourseViewPage";

export default function App() {
  return (
    <ThemeProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/courses" replace />} />
          <Route path="/courses" element={<CourseLibraryPage />} />
          <Route path="/courses/generate" element={<CourseGeneratePage />} />
          <Route path="/courses/:courseId" element={<CourseViewPage />} />
        </Routes>
      </AppShell>
    </ThemeProvider>
  );
}
