import { describe, it, expect } from 'vitest';
import { generateId, parseRuleLine } from '../utils';

describe('utils', () => {
  describe('generateId', () => {
    it('should generate a string of length 9', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBe(9);
    });

    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('parseRuleLine', () => {
    it('should parse a named rule', () => {
      const { name, pattern } = parseRuleLine('common %{IP:client_ip}');
      expect(name).toBe('common');
      expect(pattern).toBe('%{IP:client_ip}');
    });

    it('should handle multiple spaces', () => {
      const { name, pattern } = parseRuleLine('rule1   %{DATA:data}');
      expect(name).toBe('rule1');
      expect(pattern).toBe('%{DATA:data}');
    });

    it('should fallback to "rule" for bare patterns', () => {
      const { name, pattern } = parseRuleLine('%{IP:client_ip}');
      expect(name).toBe('rule');
      expect(pattern).toBe('%{IP:client_ip}');
    });

    it('should trim whitespace from pattern', () => {
      const { name, pattern } = parseRuleLine('name   pattern   ');
      expect(name).toBe('name');
      expect(pattern).toBe('pattern');
    });
  });
});
