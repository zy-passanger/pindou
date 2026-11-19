import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, normalizeAiSettings } from './aiRepository';

describe('normalizeAiSettings', () => {
  it('空值返回默认配置', () => {
    const value = normalizeAiSettings(null);
    expect(value.activeProvider).toBe('openai-images');
    expect(value.providers['openai-images'].baseUrl).toBe('https://api.openai.com/v1');
    expect(value.defaults.maxColors).toBe(12);
    expect(value.defaults.rememberKey).toBe(true);
  });

  it('非法 Base URL 回退，合法 http://localhost 保留', () => {
    const value = normalizeAiSettings({
      activeProvider: 'gemini',
      providers: {
        gemini: { baseUrl: 'javascript:alert(1)', apiKey: ' k ', imageModel: '', gridModel: '' },
        'openai-images': { baseUrl: 'http://localhost:8787/v1', apiKey: '', imageModel: '', gridModel: '' },
      },
    });
    expect(value.providers.gemini.baseUrl).toBe(DEFAULT_AI_SETTINGS.providers.gemini.baseUrl);
    expect(value.providers['openai-images'].baseUrl).toBe('http://localhost:8787/v1');
  });

  it('关闭记住密钥时不保留任何 Key', () => {
    const value = normalizeAiSettings({
      defaults: { rememberKey: false },
      providers: {
        gemini: { baseUrl: 'https://example.com/v1', apiKey: 'secret-key', imageModel: 'm', gridModel: 'g' },
      },
    });
    expect(value.providers.gemini.apiKey).toBe('');
    expect(value.defaults.rememberKey).toBe(false);
  });

  it('未知 provider/尺寸回退，颜色数被夹到 4–48', () => {
    const value = normalizeAiSettings({
      activeProvider: 'unknown',
      defaults: { mode: 'unknown', sizePreset: '1x1', maxColors: 999, style: '' },
    });
    expect(value.activeProvider).toBe('openai-images');
    expect(value.defaults.mode).toBe('image');
    expect(value.defaults.sizePreset).toBe('52x52');
    expect(value.defaults.maxColors).toBe(48);
    expect(value.defaults.style).toBe('像素风');
  });
});
