import { describe, it, expect } from 'vitest';
import { interpretStandardResult } from '../../../src/utils/result-helpers.js';

describe('interpretStandardResult', () => {
  const defaults = {
    successMessage: 'Operation successful.',
    failureMessage: 'Operation failed.',
  };

  it('maps successful response correctly with message', () => {
    const response = {
      success: true,
      message: 'Command executed successfully',
    };

    const result = interpretStandardResult(response, defaults);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Command executed successfully');
    expect(result.error).toBeUndefined();
    expect(result.cleanText).toBe('Command executed successfully');
    expect(result.rawText).toBe('Command executed successfully');
    expect(result.payload).toEqual(response);
    expect(result.raw).toBe(response);
  });

  it('maps successful response with defaults when message is missing', () => {
    const response = {
      success: true,
    };

    const result = interpretStandardResult(response, defaults);

    expect(result.success).toBe(true);
    expect(result.message).toBe(defaults.successMessage);
    expect(result.error).toBeUndefined();
    expect(result.cleanText).toBeUndefined();
    expect(result.rawText).toBe('');
    expect(result.payload).toEqual(response);
  });

  it('maps failure response with error correctly', () => {
    const response = {
      success: false,
      error: 'An unexpected error occurred',
    };

    const result = interpretStandardResult(response, defaults);

    expect(result.success).toBe(false);
    expect(result.message).toBe(defaults.failureMessage);
    expect(result.error).toBe('An unexpected error occurred');
    expect(result.payload).toEqual(response);
  });

  it('maps failure response with message used as error if error is missing', () => {
    const response = {
      success: false,
      message: 'Failed to find file',
    };

    const result = interpretStandardResult(response, defaults);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to find file');
    expect(result.error).toBe('Failed to find file');
    expect(result.payload).toEqual(response);
  });

  it('maps failure response with defaults when missing error and message', () => {
    const response = {
      success: false,
    };

    const result = interpretStandardResult(response, defaults);

    expect(result.success).toBe(false);
    expect(result.message).toBe(defaults.failureMessage);
    expect(result.error).toBe(defaults.failureMessage);
    expect(result.payload).toEqual(response);
  });

  it('prioritizes message -> output -> result for rawText', () => {
    const r1 = interpretStandardResult({ message: 'msg', output: 'out', result: 'res' }, defaults);
    expect(r1.rawText).toBe('msg');

    const r2 = interpretStandardResult({ output: 'out', result: 'res' }, defaults);
    expect(r2.rawText).toBe('out');

    const r3 = interpretStandardResult({ result: 'res' }, defaults);
    expect(r3.rawText).toBe('res');

    // Test coercion to string
    const r4 = interpretStandardResult({ result: 123 }, defaults);
    expect(r4.rawText).toBe('123');
  });

  it('handles non-object responses by defaulting to false and empty payload', () => {
    const responses = ['string response', null, undefined, 42];

    for (const response of responses) {
      const result = interpretStandardResult(response, defaults);
      expect(result.success).toBe(false);
      expect(result.message).toBe(defaults.failureMessage);
      expect(result.error).toBe(defaults.failureMessage);
      expect(result.payload).toEqual({});
      expect(result.raw).toBe(response);
    }
  });

  it('handles arrays for warnings and details correctly', () => {
    const response = {
      warnings: ['warning 1', 'warning 2'],
      details: ['detail 1'],
    };

    const result = interpretStandardResult(response, defaults);

    expect(result.warnings).toEqual(['warning 1', 'warning 2']);
    expect(result.details).toEqual(['detail 1']);
  });
});
