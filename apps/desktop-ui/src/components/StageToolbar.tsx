import { useRef } from "react";

import { useShowStore } from "../store/showStore";

export function StageToolbar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const undo = useShowStore((state) => state.undo);
  const redo = useShowStore((state) => state.redo);
  const duplicate = useShowStore((state) => state.duplicateSelection);
  const importBackground = useShowStore((state) => state.importBackground);
  const removeBackground = useShowStore((state) => state.removeBackground);
  const background = useShowStore((state) => state.background);

  return (
    <div className="stage-toolbar" role="toolbar" aria-label="Stage tools">
      <div className="tool-group">
        <button className="is-active" title="Select">↖</button>
        <button title="Pan">✋</button>
        <button title="Rectangle selection">▱</button>
      </div>
      <div className="tool-separator" />
      <div className="tool-group">
        <button onClick={undo} title="Undo">↶</button>
        <button onClick={redo} title="Redo">↷</button>
        <button onClick={duplicate} title="Duplicate selection">⧉</button>
      </div>
      <div className="tool-separator" />
      <button className="wide-tool"># GRID <span>1 m</span></button>
      <button className="wide-tool">⌁ SNAP <span>ON</span></button>
      <button className="wide-tool">▱ LAYERS <span>2</span></button>
      <div className="toolbar-spacer" />
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void importBackground(file);
          event.currentTarget.value = "";
        }}
      />
      {background ? (
        <button
          className="background-chip"
          title={background.name}
          onClick={() => {
            removeBackground();
          }}
        >
          ◫ {background.name} <span>×</span>
        </button>
      ) : (
        <button className="background-chip" onClick={() => inputRef.current?.click()}>◫ ADD FLOOR PLAN</button>
      )}
    </div>
  );
}
