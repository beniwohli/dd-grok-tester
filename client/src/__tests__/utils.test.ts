import { describe, it, expect } from 'vitest';
import { generateId, parseRuleLine, parseTerraform } from '../utils';

describe('utils', () => {
  describe('generateId', () => {
    it('should generate a UUID string', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
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

  describe('parseTerraform', () => {
    it('should parse valid terraform HCL correctly', () => {
      const hcl = `{
        id_prefix   = "apache"
        log_sources = ["nevis"]
        rules = [
          {
            name = "nevis_app_with_trace"
            rule = "\\[%%{_log.file.name}\\] %%{_timestamp_app} %%{notSpace:thread.id} %%{regex(\\"[0-9a-f]{32}\\"):trace.id} %%{regex(\\"[0-9a-f]{16}\\"):span.id}\\\\s+%%{notSpace:log.category}\\\\s+%%{_log.level}\\\\s+%%{_message}"
          },
          {
            name = "nevis_app_no_trace"
            rule = "\\[%%{_log.file.name}\\] %%{_timestamp_app} %%{notSpace:thread.id}\\\\s+%%{notSpace:log.category}\\\\s+%%{_log.level}\\\\s+%%{_message}"
          }
        ]
        support_rules = [
          {
            name = "_log.file.name"
            rule = "%%{data:log.file.name}"
          },
          {
            name = "_timestamp_app"
            rule = "%%{date(\\"yyyy-MM-dd'T'HH:mm:ss,SSS\\"):timestamp}"
          }
        ]
      }`;

      const parsed = parseTerraform(hcl);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].idPrefix).toBe('apache');
      expect(parsed[0].matchRules).toBe(
        `nevis_app_with_trace \\[%{_log.file.name}\\] %{_timestamp_app} %{notSpace:thread.id} %{regex("[0-9a-f]{32}"):trace.id} %{regex("[0-9a-f]{16}"):span.id}\\s+%{notSpace:log.category}\\s+%{_log.level}\\s+%{_message}\n` +
        `nevis_app_no_trace \\[%{_log.file.name}\\] %{_timestamp_app} %{notSpace:thread.id}\\s+%{notSpace:log.category}\\s+%{_log.level}\\s+%{_message}`
      );
      expect(parsed[0].supportRules).toBe(
        `_log.file.name %{data:log.file.name}\n` +
        `_timestamp_app %{date("yyyy-MM-dd'T'HH:mm:ss,SSS"):timestamp}`
      );
    });

    it('should parse an array of multiple terraform blocks', () => {
      const hcl = `[
  {
    id_prefix   = "gha-runner"
    log_sources = ["gha-runner"]
    rules = [
      {
        name = "github_runner_rule"
        rule = "\\\\[%%{word:component} %%{date(\\"yyyy-MM-dd HH:mm:ss'Z'\\"):timestamp} %%{word:log.level} %%{word:log.logger}\\\\]\\\\s+%%{data:message}"
      },
      {
        name = "catchall"
        rule = "%%{data:message_catchall}"
      }
    ]
  },
  {
    id_prefix   = "ci360-agents-sdk"
    log_sources = ["sas"]
    rules = [
      {
        name = "log4j"
        rule = "%%{date(\\"yyyy-MM-dd HH:mm:ss,SSS\\"):timestamp} %%{word:log.level}\\\\s+\\\\[%%{notSpace:logger.thread_name}\\\\] %%{notSpace:log.logger} - %%{data:message}"
      }
    ]
    support_rules = [
      {
        name = "_timestamp"
        rule = "%%{date(\\"yyyy-MM-dd HH:mm:ss,SSS\\"):timestamp}"
      }
    ]
  }
]`;

      const parsed = parseTerraform(hcl);
      expect(parsed).toHaveLength(2);

      expect(parsed[0].idPrefix).toBe('gha-runner');
      expect(parsed[0].matchRules).toContain('github_runner_rule');
      expect(parsed[0].matchRules).toContain('catchall');
      expect(parsed[0].supportRules).toBe('');

      expect(parsed[1].idPrefix).toBe('ci360-agents-sdk');
      expect(parsed[1].matchRules).toContain('log4j');
      expect(parsed[1].supportRules).toContain('_timestamp');
    });

    it('should strip a variable assignment prefix', () => {
      const hcl = `grok_processors = [
  {
    id_prefix   = "test"
    rules = [
      {
        name = "my_rule"
        rule = "%%{data:message}"
      }
    ]
  }
]`;

      const parsed = parseTerraform(hcl);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].idPrefix).toBe('test');
      expect(parsed[0].matchRules).toBe('my_rule %{data:message}');
    });
  });
});
