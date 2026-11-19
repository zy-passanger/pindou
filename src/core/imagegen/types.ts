export type AiProviderId = 'openai-images' | 'openai-chat' | 'gemini';
export type AiMode = 'image' | 'grid';
export type AiSizePreset = '44x52' | '52x52' | '78x78' | '104x104';

export interface AiProviderConfig {
  baseUrl: string;
  /** 只在「记住密钥」开启时写入 IndexedDB。 */
  apiKey: string;
  imageModel: string;
  gridModel: string;
}

export interface AiSettingsValue {
  schemaVersion: 1;
  activeProvider: AiProviderId;
  providers: Record<AiProviderId, AiProviderConfig>;
  defaults: {
    mode: AiMode;
    sizePreset: AiSizePreset;
    maxColors: number;
    style: string;
    rememberKey: boolean;
  };
}

export interface GeneratedImage {
  kind: 'base64' | 'url';
  /** 不带 data: 前缀的 base64，或绝对 http(s) URL。 */
  value: string;
  mime?: string;
  revisedPrompt?: string;
  provider: AiProviderId;
}

export interface ImageGenRequest {
  provider: AiProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}

export interface GridRequest extends ImageGenRequest {
  width: number;
  height: number;
  maxColors: number;
}

export interface GridData {
  width: number;
  height: number;
  /** 单字符键 -> #RRGGBB */
  palette: Record<string, string>;
  rows: string[];
}

export interface ImageGenResult {
  images: GeneratedImage[];
  text?: string;
}

export interface GridParseResult {
  ok: boolean;
  grid?: GridData;
  errors: string[];
}

export const AI_PROVIDERS: Array<{ id: AiProviderId; label: string; hint: string }> = [
  { id: 'openai-images', label: 'OpenAI Images', hint: '/images/generations，兼容多数聚合网关' },
  { id: 'openai-chat', label: 'OpenAI Chat', hint: '/chat/completions，适合 OpenRouter 等图片/文本模型' },
  { id: 'gemini', label: 'Google Gemini', hint: 'generateContent，支持 inlineData 图片与文本' },
];

export const AI_SIZE_PRESETS: Array<{ id: AiSizePreset; width: number; height: number; label: string }> = [
  { id: '44x52', width: 44, height: 52, label: '44×52' },
  { id: '52x52', width: 52, height: 52, label: '52×52' },
  { id: '78x78', width: 78, height: 78, label: '78×78' },
  { id: '104x104', width: 104, height: 104, label: '104×104' },
];

export const AI_STYLES = ['像素风', 'Q 版', '扁平插画', '水彩', '复古游戏', '赛博霓虹'];

export function sizePresetFor(width: number, height: number): AiSizePreset | null {
  const found = AI_SIZE_PRESETS.find((preset) => preset.width === width && preset.height === height);
  return found?.id ?? null;
}

export function sizeOf(preset: AiSizePreset): { width: number; height: number } {
  const found = AI_SIZE_PRESETS.find((item) => item.id === preset) ?? AI_SIZE_PRESETS[1];
  return { width: found.width, height: found.height };
}
