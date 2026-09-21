import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../hash';

const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('sha256Hex', () => {
  it('hashes a Blob', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe(ABC);
  });

  it('hashes an ArrayBuffer and a Uint8Array identically', async () => {
    const bytes = new TextEncoder().encode('abc');
    expect(await sha256Hex(bytes)).toBe(ABC);
    expect(await sha256Hex(bytes.buffer.slice(0))).toBe(ABC);
  });
});
