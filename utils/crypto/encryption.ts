/**
 * 加密模块 - AES-256-GCM
 *
 * 密文格式与后端保持一致：
 * v1.AES_GCM.<nonce_b64>.<ciphertext_b64>.<tag_b64>
 *
 * 使用 Web Crypto API (浏览器原生支持)
 */

import { BASE64 } from './base64';

// 常量
const NONCE_SIZE = 12; // 96-bit (与后端一致)
const TAG_SIZE = 16; // 128-bit (与后端一致)
const KEY_SIZE = 32; // 256-bit
const VERSION = 'v1';
const ALGORITHM = 'AES_GCM';

/**
 * 从 ArrayBuffer 生成随机字节
 */
function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * 使用 AES-256-GCM 加密明文
 *
 * @param plaintext - 待加密的明文
 * @param key - 32 字节的加密密钥
 * @returns 版本化的密文格式: v1.AES_GCM.<nonce_b64>.<ciphertext_b64>.<tag_b64>
 */
export async function encrypt(plaintext: string, key: Uint8Array): Promise<string> {
  if (!plaintext) {
    throw new Error('Plaintext must not be empty');
  }
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes, got ${key.length}`);
  }

  // 生成随机 nonce
  const nonce = randomBytes(NONCE_SIZE);

  // 导入密钥
  const cryptoKey = await (crypto.subtle.importKey as any)(
    'raw',
    key,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt']
  );

  // 编码明文
  const plaintextBytes = new TextEncoder().encode(plaintext);

  // 加密 (GCM 模式会自动附加 16-byte tag)
  const ciphertextWithTag = await (crypto.subtle.encrypt as any)(
    { name: ALGORITHM, iv: nonce, tagLength: TAG_SIZE * 8 },
    cryptoKey,
    plaintextBytes
  );

  // 分离密文和 tag
  const ciphertext = new Uint8Array(ciphertextWithTag.slice(0, -TAG_SIZE));
  const tag = new Uint8Array(ciphertextWithTag.slice(-TAG_SIZE));

  // 编码为 Base64 (URL-safe, no padding)
  const nonceB64 = BASE64.encode(nonce);
  const ciphertextB64 = BASE64.encode(ciphertext);
  const tagB64 = BASE64.encode(tag);

  return `${VERSION}.${ALGORITHM}.${nonceB64}.${ciphertextB64}.${tagB64}`;
}

/**
 * 解密版本化的密文
 *
 * @param encrypted - 版本化的密文字符串
 * @param key - 32 字节的加密密钥
 * @returns 解密后的明文
 */
export async function decrypt(encrypted: string, key: Uint8Array): Promise<string> {
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes, got ${key.length}`);
  }

  const parts = encrypted.split('.');
  if (parts.length !== 5) {
    throw new Error(`Invalid encrypted format: expected 5 parts, got ${parts.length}`);
  }

  const [version, algorithm, nonceB64, ciphertextB64, tagB64] = parts;

  if (version !== VERSION) {
    throw new Error(`Unsupported version: ${version}`);
  }
  if (algorithm !== ALGORITHM) {
    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  // 解码 Base64
  const nonce = BASE64.decode(nonceB64);
  const ciphertext = BASE64.decode(ciphertextB64);
  const tag = BASE64.decode(tagB64);

  if (nonce.length !== NONCE_SIZE) {
    throw new Error(`Invalid nonce size: expected ${NONCE_SIZE}, got ${nonce.length}`);
  }
  if (tag.length !== TAG_SIZE) {
    throw new Error(`Invalid tag size: expected ${TAG_SIZE}, got ${tag.length}`);
  }

  // 导入密钥
  const cryptoKey = await (crypto.subtle.importKey as any)(
    'raw',
    key,
    { name: ALGORITHM, length: 256 },
    false,
    ['decrypt']
  );

  // 合并密文和 tag
  const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
  ciphertextWithTag.set(ciphertext, 0);
  ciphertextWithTag.set(tag, ciphertext.length);

  // 解密
  const plaintextBytes = await (crypto.subtle.decrypt as any)(
    { name: ALGORITHM, iv: nonce, tagLength: TAG_SIZE * 8 },
    cryptoKey,
    ciphertextWithTag
  );

  return new TextDecoder().decode(plaintextBytes);
}

/**
 * 从密码派生加密密钥
 *
 * 注意：浏览器不支持 Argon2id，此处使用 PBKDF2。
 * 与后端 Argon2id 的输出不兼容，仅用于前端临时测试。
 * 生产环境应使用 argon2-browser WASM 库。
 *
 * @param password - 用户密码
 * @param salt - 盐 (通常为用户邮箱)
 * @param iterations - 迭代次数 (建议 100000+)
 * @returns 32 字节的派生密钥
 */
export async function deriveKey(
  password: string,
  salt: string,
  iterations: number = 100000
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const saltBytes = encoder.encode(salt);

  // 导入密码作为 key
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // 派生密钥
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    KEY_SIZE * 8
  );

  return new Uint8Array(derivedBits);
}

/**
 * 生成随机用户密钥 (32 字节)
 */
export function generateUserKey(): Uint8Array {
  return randomBytes(KEY_SIZE);
}

/**
 * 将 Uint8Array 转换为十六进制字符串
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 将十六进制字符串转换为 Uint8Array
 */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
