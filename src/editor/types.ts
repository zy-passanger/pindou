export type ToolId = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'ellipse' | 'pan';
export type Symmetry = 'none' | 'h' | 'v' | 'both';
export type ChangeReason =
  | 'stroke'
  | 'fill'
  | 'shape'
  | 'undo'
  | 'redo'
  | 'resize'
  | 'transform'
  | 'replace'
  | 'clear'
  | 'import';

export interface CellCoord {
  x: number;
  y: number;
}

export interface EditorOptions {
  tool: ToolId;
  colorIndex: number;
  brush: number;
  symmetry: Symmetry;
  showCodes: boolean;
  showGrid: boolean;
}

export interface EditorCallbacks {
  getOptions: () => EditorOptions;
  onChange: (reason: ChangeReason) => void;
  onZoom: (zoom: number) => void;
  onHover: (cell: CellCoord | null) => void;
  onPick: (index: number) => void;
}
