import { NavLink, useLocation } from "react-router-dom";
import { useTheme } from "../theme";
import type { PropsWithChildren } from "react";

export function AppShell({ children }: PropsWithChildren) {
  const { mode, toggleTheme } = useTheme();
  const location = useLocation();
  const provider = import.meta.env.VITE_LLM_PROVIDER ?? "OpenRouter";
  const model = import.meta.env.VITE_LLM_MODEL ?? "openrouter/hunter-alpha";
  const routeLabel = location.pathname === "/" ? "/courses" : location.pathname;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <NavLink className="brand" to="/courses">
            Logos
          </NavLink>
          <span className="brand-tag">
            API: {provider} &middot; Model: {model}
          </span>
        </div>

        <nav className="topnav">
          <NavLink
            to="/courses"
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            Existing Courses
          </NavLink>
          <NavLink
            to="/courses/generate"
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            Generate Course
          </NavLink>
          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {mode === "dark" ? "Light theme" : "Dark theme"}
          </button>
        </nav>
      </header>

      <main className="page-shell">{children}</main>
    </div>
  );
}
