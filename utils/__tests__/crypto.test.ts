/**
 * 加密模块测试
 *
 * 运行方式：在浏览器控制台中执行
 */

import { encrypt, decrypt, deriveKey, generateUserKey, toHex, fromHex } from '../crypto/encryption';

// 测试辅助函数
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✓ ${message}`);
}

async function runTests() {
  console.log('Starting encryption module tests...\n');

  // Test 1: generateUserKey generates 32 bytes
  {
    const key = generateUserKey();
    assert(key.length === 32, 'generateUserKey returns 32 bytes');
  }

  // Test 2: toHex and fromHex
  {
    const original = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0xff, 0xfe]);
    const hex = toHex(original);
    assert(hex === '01020304fffe', 'toHex encodes correctly');
    const decoded = fromHex(hex);
    assert(decoded.length === original.length, 'fromHex decodes correctly');
    assert(Array.from(decoded).every((b, i) => b === original[i]), 'fromHex preserves data');
  }

  // Test 3: AES-GCM encryption/decryption
  {
    const key = generateUserKey();
    const plaintext = 'Hello, World! 你好世界！';
    
    const ciphertext = await encrypt(plaintext, key);
    assert(typeof ciphertext === 'string', 'encrypt returns string');
    assert(ciphertext.startsWith('v1.AES_GCM.'), 'ciphertext has correct format');
    
    const parts = ciphertext.split('.');
    assert(parts.length === 5, 'ciphertext has 5 parts');
    
    const decrypted = await decrypt(ciphertext, key);
    assert(decrypted === plaintext, 'decrypt recovers original plaintext');
  }

  // Test 4: Different plaintexts produce different ciphertexts
  {
    const key = generateUserKey();
    const ct1 = await encrypt('text1', key);
    const ct2 = await encrypt('text2', key);
    assert(ct1 !== ct2, 'different plaintexts produce different ciphertexts');
  }

  // Test 5: Same plaintext with same key produces different ciphertext (due to random nonce)
  {
    const key = generateUserKey();
    const plaintext = 'test';
    const ct1 = await encrypt(plaintext, key);
    const ct2 = await encrypt(plaintext, key);
    assert(ct1 !== ct2, 'same plaintext produces different ciphertext (random nonce)');
    
    // But both should decrypt to the same value
    const dec1 = await decrypt(ct1, key);
    const dec2 = await decrypt(ct2, key);
    assert(dec1 === plaintext && dec2 === plaintext, 'both decrypt to original');
  }

  // Test 6: deriveKey
  {
    const password = 'test_password';
    const salt = 'user@example.com';
    
    const key1 = await deriveKey(password, salt, 1000);
    assert(key1.length === 32, 'deriveKey returns 32 bytes');
    
    // Same inputs should produce same key
    const key2 = await deriveKey(password, salt, 1000);
    assert(Array.from(key1).every((b, i) => b === key2[i]), 'deriveKey is deterministic');
    
    // Different password should produce different key
    const key3 = await deriveKey('different_password', salt, 1000);
    assert(!Array.from(key1).every((b, i) => b === key3[i]), 'different password produces different key');
    
    // Different salt should produce different key
    const key4 = await deriveKey(password, 'different@salt.com', 1000);
    assert(!Array.from(key1).every((b, i) => b === key4[i]), 'different salt produces different key');
  }

  // Test 7: Error handling - wrong key
  {
    const key = generateUserKey();
    const wrongKey = generateUserKey();
    const plaintext = 'secret';
    
    const ciphertext = await encrypt(plaintext, key);
    
    try {
      await decrypt(ciphertext, wrongKey);
      assert(false, 'decrypt with wrong key should throw');
    } catch (e: any) {
      assert(e.message.includes('auth') || e.message.includes('tag'), 'decrypt with wrong key throws authentication error');
    }
  }

  // Test 8: Error handling - wrong format
  {
    const key = generateUserKey();
    
    try {
      await decrypt('invalid', key);
      assert(false, 'decrypt with invalid format should throw');
    } catch (e: any) {
      assert(e.message.includes('Invalid encrypted format'), 'decrypt with invalid format throws format error');
    }
  }

  console.log('\n✅ All tests passed!');
}

// 运行测试
runTests().catch(console.error);
