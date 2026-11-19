import { describe, expect, it } from 'vitest';
import { joinApiUrl, joinGeminiUrl, readApiError, redactSecrets } from './http';

describe('imagegen http helpers', () => {
  it('拼接 OpenAI 端点且允许完整端点', () => {
    expect(joinApiUrl('https://api.openai.com/v1/', '/images/generations')).toBe('https://api.openai.com/v1/images/generations');
    expect(joinApiUrl('https://api.openai.com/v1/images/generations', '/images/generations')).toBe('https://api.openai.com/v1/images/generations');
  });

  it('拼接 Gemini 模型端点', () => {
    expect(joinGeminiUrl('https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash-image'))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent');
    expect(joinGeminiUrl('https://generativelanguage.googleapis.com/v1beta/models', 'm'))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models/m:generateContent');
  });

  it('读取常见错误结构', () => {
    expect(readApiError({ error: { message: 'bad key' } })).toBe('bad key');
    expect(readApiError({ error: 'bad' })).toBe('bad');
    expect(readApiError({ message: 'bad' })).toBe('bad');
    expect(readApiError({})).toBeNull();
  });

  it('脱敏 Key/Bearer/query key', () => {
    const text = 'Authorization: Bearer sk-1234567890 and key=abc123 and AIzaSyABCDEFG';
    const redacted = redactSecrets(text, 'sk-1234567890');
    expect(redacted).not.toContain('sk-1234567890');
    expect(redacted).not.toContain('abc123');
    expect(redacted).not.toContain('AIzaSyABCDEFG');
    expect(redacted).toContain('[已隐藏]');
  });
});
