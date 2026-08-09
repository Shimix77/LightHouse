import { useEffect } from "react";

interface UserGuideDialogProps {
  onClose: () => void;
}

const steps = [
  {
    number: "1",
    title: "Create a project",
    body: <>Choose <b>New Project</b> on the start screen. LightHouse saves project changes automatically.</>,
  },
  {
    number: "2",
    title: "Choose a DMX output",
    body: <>Select <b>USB-DMX</b>, <b>Art-Net</b>, or <b>No DMX Output</b> in Project Setup. Physical output stays disabled until you explicitly enable it.</>,
  },
  {
    number: "3",
    title: "Add and patch fixtures",
    body: <>In <b>EDIT</b> mode open the Fixture Library, choose the exact model and DMX mode, then use <b>Find Free</b> and <b>Patch</b> to assign the next available address.</>,
  },
  {
    number: "4",
    title: "Build the stage layout",
    body: <>Move fixtures on the central Stage Editor. Add an optional PNG/JPG floor plan with <b>Add Floor Plan</b>. Hold <b>Shift</b> to select multiple fixtures.</>,
  },
  {
    number: "5",
    title: "Create a lighting look",
    body: <>Select a fixture and use the inspector to set <b>Intensity, Color, Pan, Tilt</b>, or <b>Zoom</b>. The physical fixture must use the same mode and address.</>,
  },
  {
    number: "6",
    title: "Capture a scene",
    body: <>Open <b>Scenes</b> and choose <b>Capture Scene</b>. With fixtures selected, LightHouse captures a partial scene; with no selection, it captures all fixtures.</>,
  },
  {
    number: "7",
    title: "Prepare playback",
    body: <>Use <b>+ CUE</b> to add a scene to the Cue List or <b>+ LIVE</b> for a large trigger button. You can also drag scenes and effects from the Preset Palette to the Live panel.</>,
  },
  {
    number: "8",
    title: "Run the show",
    body: <>Switch to <b>LIVE</b>. Trigger scenes from the Live panel or use <b>GO</b> for the Cue List. <b>BLACKOUT</b> immediately forces every fixture intensity to zero.</>,
  },
];

export function UserGuideDialog({ onClose }: UserGuideDialogProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixture-dialog-backdrop guide-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="fixture-dialog guide-dialog" role="dialog" aria-modal="true" aria-label="User Guide – first lighting show" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><small>GETTING STARTED</small><h2>Your first lighting show</h2></div>
          <button type="button" aria-label="Close User Guide" onClick={onClose}>×</button>
        </header>

        <div className="guide-intro">
          Follow these steps from an empty project to your first live scene. You can prepare output settings, patching, and scenes without connected fixtures.
        </div>

        <div className="guide-steps">
          {steps.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <div><h3>{step.title}</h3><p>{step.body}</p></div>
            </article>
          ))}
        </div>

        <div className="guide-safety">
          <strong>Before enabling physical output</strong>
          <span>Start with GRAND MASTER at 0%, verify fixture modes and addresses, then raise intensity slowly. The red BLACKOUT control is always available.</span>
        </div>

        <footer><span /><button className="primary" type="button" onClick={onClose}>Got it, start</button></footer>
      </section>
    </div>
  );
}
