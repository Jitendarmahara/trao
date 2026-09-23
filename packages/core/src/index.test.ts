import { describe, it, expect } from 'vitest';
import { CORE_VERSION } from './index.js';

describe('core scaffold', () => {
  it('exposes a version string', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});
