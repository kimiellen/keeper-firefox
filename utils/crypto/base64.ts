/**
 * Base64 编解码工具
 *
 * 使用 URL-safe, no-padding 格式，与后端保持一致
 */

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * 编码为 Base64 (URL-safe, no padding)
 */
export function encode(data: Uint8Array): string {
  let result = '';
  let i = 0;

  while (i < data.length) {
    const b1 = data[i++];
    const b2 = i < data.length ? data[i++] : 0;
    const b3 = i < data.length ? data[i++] : 0;

    result += BASE64_CHARS[b1 >> 2];
    result += BASE64_CHARS[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += i > data.length + 1 ? '=' : BASE64_CHARS[((b2 & 0x0f) << 2) | (b3 >> 6)];
    result += i > data.length ? '=' : BASE64_CHARS[b3 & 0x3f];
  }

  // 移除 padding
  return result.replace(/=+$/, '');
}

/**
 * 解码 Base64 (URL-safe)
 */
export function decode(base64: string): Uint8Array {
  // 补齐 padding
  const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
  const chars: number[] = [];

  for (let i = 0; i < padded.length; i += 4) {
    const b1 = BASE64_CHARS.indexOf(padded[i]);
    const b2 = BASE64_CHARS.indexOf(padded[i + 1]);
    const b3 = BASE64_CHARS.indexOf(padded[i + 2]);
    const b4 = BASE64_CHARS.indexOf(padded[i + 3]);

    chars.push((b1 << 2) | (b2 >> 4));
    if (b3 !== -1) chars.push(((b2 & 0x0f) << 4) | (b3 >> 2));
    if (b4 !== -1) chars.push(((b3 & 0x03) << 6) | b4);
  }

  return new Uint8Array(chars);
}

export const BASE64 = {
  encode,
  decode,
};
