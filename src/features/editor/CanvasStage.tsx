import { useEffect, useRef } from 'react';
import type { Project } from '@/core/model';
import { INDEX_BY_CODE } from '@/core/palette';
import { useAppStore } from '@/store/appStore';
import { EditorEngine } from '@/editor/EditorEngine';
import type { CellCoord, ChangeReason } from '@/editor/types';

interface CanvasStageProps {
  project: Project;
  onReady: (engine: EditorEngine) => void;
  onChange: (reason: ChangeReason) => void;
  onZoom: (zoom: number) => void;
  onHover: (cell: CellCoord | null) => void;
  onPick: (index: number) => void;
}

export function CanvasStage(props: CanvasStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const engine = new EditorEngine(stage, props.project, {
      getOptions: () => {
        const state = useAppStore.getState();
        return {
          tool: state.tool,
          colorIndex: INDEX_BY_CODE.get(state.selectedColorCode) ?? 0,
          brush: state.brushSize,
          symmetry: state.symmetry,
          showCodes: state.showCodes,
          showGrid: state.showGrid,
        };
      },
      onChange: (reason) => propsRef.current.onChange(reason),
      onZoom: (zoom) => propsRef.current.onZoom(zoom),
      onHover: (cell) => propsRef.current.onHover(cell),
      onPick: (index) => propsRef.current.onPick(index),
    });
    propsRef.current.onReady(engine);
    return () => engine.destroy();
    // project.id 变化时重新建引擎；同一工程的 cells 由引擎原地修改。
  }, [props.project.id]);

  return <div className="canvas-stage" ref={stageRef} />;
}
