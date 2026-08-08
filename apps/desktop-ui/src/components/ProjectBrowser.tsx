import { useState } from "react";

import { hasNativeEngine } from "../services/engineClient";
import { useShowStore } from "../store/showStore";
import { UserGuideDialog } from "./UserGuideDialog";

interface ProjectBrowserProps {
  onOpenWorkspace: () => void;
  onStartSetup: () => void;
}

export function ProjectBrowser({ onOpenWorkspace, onStartSetup }: ProjectBrowserProps) {
  const projectName = useShowStore((state) => state.projectName);
  const projectPath = useShowStore((state) => state.projectPath);
  const recentProjects = useShowStore((state) => state.recentProjects);
  const newProject = useShowStore((state) => state.newProject);
  const openProject = useShowStore((state) => state.openProject);
  const openRecentProject = useShowStore((state) => state.openRecentProject);
  const projectBusy = useShowStore((state) => state.projectBusy);
  const [guideOpen, setGuideOpen] = useState(false);

  const create = async () => {
    const previousPath = useShowStore.getState().projectPath;
    await newProject();
    const nextPath = useShowStore.getState().projectPath;
    if (!hasNativeEngine() || nextPath !== previousPath) onStartSetup();
  };

  const openFile = async () => {
    const previousPath = useShowStore.getState().projectPath;
    await openProject();
    const nextPath = useShowStore.getState().projectPath;
    if (!hasNativeEngine() || nextPath !== previousPath) onOpenWorkspace();
  };

  const openRecent = async (path: string) => {
    await openRecentProject(path);
    onOpenWorkspace();
  };

  const cards = recentProjects.length > 0
    ? recentProjects.slice(0, 5)
    : [{ name: projectName || "Isaac Records", path: projectPath }];

  return (
    <main className="project-browser-shell">
      <div className="mac-traffic" aria-hidden="true"><i /><i /><i /></div>
      <section className="project-browser-hero">
        <div className="project-browser-brand">
          <div className="lighthouse-app-icon" aria-hidden="true"><span /><b /></div>
          <div><h1>LIGHTHOUSE</h1><p>Professional Stage Lighting Control. Mac Style.</p></div>
        </div>
        <div className="project-browser-preview" aria-label="LightHouse workspace preview">
          <div className="preview-window-bar"><i /><i /><i /><span>LightHouse</span></div>
          <div className="preview-stage">
            <div className="preview-truss" />
            <i className="preview-beam beam-one" /><i className="preview-beam beam-two" />
            <i className="preview-beam beam-three" /><i className="preview-beam beam-four" />
            <div className="preview-audience" />
          </div>
          <div className="preview-console"><span /><span /><span /><span /><span /></div>
        </div>
      </section>

      <section className="project-browser-links">
        <button onClick={() => setGuideOpen(true)}><span className="line-icon">▱</span><div><strong>Open User Guide</strong><small>Learn the first steps and prepare your first show.</small></div><b>›</b></button>
        <button onClick={onStartSetup}><span className="line-icon">◉</span><div><strong>Offline Fixture Library</strong><small><i className="status-dot is-good" /> Ready for your show</small></div><b>›</b></button>
      </section>

      <section className="project-card-deck">
        <div className="project-deck-group recent-group">
          <header><span>RECENT PROJECTS</span><button onClick={() => { void openFile(); }}>Open Other…</button></header>
          <div className="project-card-row">
            {cards.slice(0, 2).map((project) => (
              <button
                className="project-card"
                key={project.path || project.name}
                title={project.path || "Current preview project"}
                onDoubleClick={() => project.path ? void openRecent(project.path) : onOpenWorkspace()}
              >
                <StageThumbnail variant="blue" />
                <strong>{project.name}</strong>
                <small>Double-click to open</small>
              </button>
            ))}
            <button className="project-card new-project-card" disabled={projectBusy} onClick={() => { void create(); }}>
              <span>＋</span><strong>New Project</strong><small>{projectBusy ? "Creating…" : "Start guided setup"}</small>
            </button>
          </div>
        </div>
        <div className="project-deck-group demo-group">
          <header><span>DEMO PROJECTS</span></header>
          <div className="project-card-row">
            <button className="project-card" onDoubleClick={onOpenWorkspace}><StageThumbnail variant="white" /><strong>LightHouse Demo</strong><small>Double-click to open</small></button>
            <button className="project-card" onDoubleClick={onOpenWorkspace}><StageThumbnail variant="violet" /><strong>Effects Showcase</strong><small>Double-click to open</small></button>
          </div>
        </div>
      </section>
      {guideOpen && <UserGuideDialog onClose={() => setGuideOpen(false)} />}
    </main>
  );
}

function StageThumbnail({ variant }: { variant: "blue" | "white" | "violet" }) {
  return <span className={`stage-thumbnail is-${variant}`}><i /><i /><i /><i /><b /></span>;
}
