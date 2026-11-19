import { describe, expect, it } from 'vitest';
import { base64ToBytes, sniffImageMime } from './decode';

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe('imagegen decode helpers', () => {
  it('解码普通 base64 和 data URL base64', () => {
    expect(Array.from(base64ToBytes('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(base64ToBytes('data:image/png;base64,AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(base64ToBytes('AQID\n'))).toEqual([1, 2, 3]);
  });

  it('无效 base64 抛出可读错误', () => {
    expect(() => base64ToBytes('%%%%')).toThrow('base64');
  });

  it('嗅探 PNG/JPEG/WebP，拒绝其他格式', () => {
    expect(sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffImageMime(bytes(0xff, 0xd8, 0xff, 0x00))).toBe('image/jpeg');
    expect(sniffImageMime(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp');
    expect(sniffImageMime(bytes(0x3c, 0x73, 0x76, 0x67))).toBeNull();
    expect(sniffImageMime(bytes())).toBeNull();
  });
});
