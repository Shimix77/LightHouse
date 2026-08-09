import { useRef, useState } from "react";

import { useShowStore } from "../store/showStore";
import type { StageObjectKind } from "../types/show";

const objects: Array<{ name: string; kind: StageObjectKind; icon: string }> = [
  { name: "Rectangle", kind: "shape", icon: "▭" },
  { name: "Rounded Rectangle", kind: "shape", icon: "▢" },
  { name: "Circle", kind: "shape", icon: "○" },
  { name: "Triangle", kind: "shape", icon: "△" },
  { name: "Line", kind: "shape", icon: "╱" },
  { name: "Straight Truss", kind: "truss", icon: "▱" },
  { name: "Arc Truss", kind: "truss", icon: "⌒" },
  { name: "Circular Truss", kind: "truss", icon: "◯" },
  { name: "Stage", kind: "stage", icon: "▰" },
  { name: "Speaker", kind: "speaker", icon: "◉" },
  { name: "Person", kind: "person", icon: "♙" },
  { name: "Text", kind: "shape", icon: "A" },
];

export function StageObjectPalette() {
  const [tab, setTab] = useState<"objects" | "images">("objects");
  const inputRef = useRef<HTMLInputElement>(null);
  const addStageObject = useShowStore((state) => state.addStageObject);
  const importBackground = useShowStore((state) => state.importBackground);
  const background = useShowStore((state) => state.background);
  const removeBackground = useShowStore((state) => state.removeBackground);

  return (
    <section className="stage-object-palette">
      <header><button className={tab === "objects" ? "is-active" : ""} onClick={() => setTab("objects")}>Shapes</button><button className={tab === "images" ? "is-active" : ""} onClick={() => setTab("images")}>Images</button></header>
      {tab === "objects" ? <div className="stage-object-grid">{objects.map((object) => <button key={object.name} title={`Add ${object.name}`} onClick={() => addStageObject(object.kind, object.name)}><span>{object.icon}</span><small>{object.name}</small></button>)}</div> : <div className="stage-image-palette"><input ref={inputRef} hidden type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackground(file); }} />{background ? <><div style={{ backgroundImage: `url(${background.dataUrl})` }} /><strong>{background.name}</strong><button onClick={() => inputRef.current?.click()}>Replace…</button><button onClick={removeBackground}>Remove</button></> : <button className="stage-image-drop" onClick={() => inputRef.current?.click()}><span>＋</span><strong>Add PNG or JPG</strong><small>Floor plan or venue reference</small></button>}</div>}
    </section>
  );
}
