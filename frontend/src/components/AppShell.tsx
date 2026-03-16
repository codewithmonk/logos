import { useEffect, useState, type PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
import { useTheme } from "../theme";

export function AppShell({ children }: PropsWithChildren) {
  const { mode, toggleTheme } = useTheme();
  const [runtimeConfig, setRuntimeConfig] = useState({
    provider: "OpenRouter",
    model: "openrouter/hunter-alpha",
  });

  useEffect(() => {
    let isMounted = true;

    void api
      .getRuntimeConfig()
      .then((config) => {
        if (isMounted) {
          setRuntimeConfig(config);
        }
      })
      .catch(() => {
        // Keep fallback labels if the config endpoint is unavailable.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <NavLink className="brand" to="/courses">
            Logos
          </NavLink>
          <span className="brand-tag">
            {runtimeConfig.provider} &middot; {runtimeConfig.model}
          </span>
        </div>

        <nav className="topnav">
          <NavLink
            to="/courses"
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            Library
          </NavLink>
          <NavLink
            to="/courses/generate"
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            Generate
          </NavLink>
          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {mode === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </nav>
      </header>

      <main className="page-shell">{children}</main>
    </div>
  );
}
