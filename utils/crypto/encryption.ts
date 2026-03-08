/**
 * 加密模块 - AES-256-GCM
 *
 * 密文格式与后端保持一致：
 * v1.AES_GCM.<nonce_b64>.<ciphertext_b64>.<tag_b64>
 *
 * 使用 Web Crypto API (浏览器原生支持)
 */

import { BASE64 } from './base64';

const NONCE_SIZE = 12;
const TAG_SIZE = 16;
const KEY_SIZE = 32;
const VERSION = 'v1';
const ALGORITHM = 'AES_GCM'; // 密文格式标识符 (序列化用)
const WEB_CRYPTO_ALGO = 'AES-GCM'; // Web Crypto API 算法名称

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function encrypt(plaintext: string, key: Uint8Array): Promise<string> {
  if (!plaintext) {
    throw new Error('Plaintext must not be empty');
  }
  if (key.length !== KEY_SIZE) {
    throw new Error(`Key must be ${KEY_SIZE} bytes, got ${key.length}`);
  }

  const nonce = randomBytes(NONCE_SIZE);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer as ArrayBuffer,
    { name: WEB_CRYPTO_ALGO, length: 256 },
    false,
    ['encrypt']
  );

  const plaintextBytes = new TextEncoder().encode(plaintext);

  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: WEB_CRYPTO_ALGO, iv: nonce.buffer as ArrayBuffer, tagLength: TAG_SIZE * 8 },
    cryptoKey,
    plaintextBytes
  );

  const ciphertext = new Uint8Array(ciphertextWithTag.slice(0, -TAG_SIZE));
  const tag = new Uint8Array(ciphertextWithTag.slice(-TAG_SIZE));

  const nonceB64 = BASE64.encode(nonce);
  const ciphertextB64 = BASE64.encode(ciphertext);
  const tagB64 = BASE64.encode(tag);

  return `${VERSION}.${ALGORITHM}.${nonceB64}.${ciphertextB64}.${tagB64}`;
}

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

  const nonce = BASE64.decode(nonceB64);
  const ciphertext = BASE64.decode(ciphertextB64);
  const tag = BASE64.decode(tagB64);

  if (nonce.length !== NONCE_SIZE) {
    throw new Error(`Invalid nonce size: expected ${NONCE_SIZE}, got ${nonce.length}`);
  }
  if (tag.length !== TAG_SIZE) {
    throw new Error(`Invalid tag size: expected ${TAG_SIZE}, got ${tag.length}`);
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer as ArrayBuffer,
    { name: WEB_CRYPTO_ALGO, length: 256 },
    false,
    ['decrypt']
  );

  const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
  ciphertextWithTag.set(ciphertext, 0);
  ciphertextWithTag.set(tag, ciphertext.length);

  const plaintextBytes = await crypto.subtle.decrypt(
    { name: WEB_CRYPTO_ALGO, iv: nonce.buffer as ArrayBuffer, tagLength: TAG_SIZE * 8 },
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
 */
export async function deriveKey(
  password: string,
  salt: string,
  iterations: number = 100000
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const saltBytes = encoder.encode(salt);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );

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

export function generateUserKey(): Uint8Array {
  return randomBytes(KEY_SIZE);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
