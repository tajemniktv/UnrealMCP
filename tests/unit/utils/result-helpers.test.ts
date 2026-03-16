import { describe, it, expect } from 'vitest';
import { interpretStandardResult, InterpretedStandardResult } from '../../../src/utils/result-helpers.js';

describe('interpretStandardResult', () => {
  const defaults = {
    successMessage: 'Operation successful.',
    failureMessage: 'Operation failed.',
  };

  const testCases: Array<{
    name: string;
    response: unknown;
    expected: Partial<InterpretedStandardResult>;
  }> = [
    {
      name: 'successful response correctly with message',
      response: { success: true, message: 'Command executed successfully' },
      expected: {
        success: true,
        message: 'Command executed successfully',
        error: undefined,
        cleanText: 'Command executed successfully',
        rawText: 'Command executed successfully',
        payload: { success: true, message: 'Command executed successfully' },
      },
    },
    {
      name: 'successful response with defaults when message is missing',
      response: { success: true },
      expected: {
        success: true,
        message: defaults.successMessage,
        error: undefined,
        cleanText: undefined,
        rawText: '',
        payload: { success: true },
      },
    },
    {
      name: 'failure response with error correctly',
      response: { success: false, error: 'An unexpected error occurred' },
      expected: {
        success: false,
        message: defaults.failureMessage,
        error: 'An unexpected error occurred',
        payload: { success: false, error: 'An unexpected error occurred' },
      },
    },
    {
      name: 'failure response with message used as error if error is missing',
      response: { success: false, message: 'Failed to find file' },
      expected: {
        success: false,
        message: 'Failed to find file',
        error: 'Failed to find file',
        payload: { success: false, message: 'Failed to find file' },
      },
    },
    {
      name: 'failure response with defaults when missing error and message',
      response: { success: false },
      expected: {
        success: false,
        message: defaults.failureMessage,
        error: defaults.failureMessage,
        payload: { success: false },
      },
    },
    {
      name: 'arrays for warnings and details correctly',
      response: { warnings: ['warning 1', 'warning 2'], details: ['detail 1'] },
      expected: {
        warnings: ['warning 1', 'warning 2'],
        details: ['detail 1'],
      },
    },
  ];

  it.each(testCases)('maps $name', ({ response, expected }) => {
    const result = interpretStandardResult(response, defaults);
    expect(result).toMatchObject(expected);
  });

  describe('rawText prioritization', () => {
    it.each([
      [{ message: 'msg', output: 'out', result: 'res' }, 'msg'],
      [{ output: 'out', result: 'res' }, 'out'],
      [{ result: 'res' }, 'res'],
      [{ result: 123 }, '123'],
    ])('maps %j to rawText %s', (response, expectedRawText) => {
      const result = interpretStandardResult(response, defaults);
      expect(result.rawText).toBe(expectedRawText);
    });
  });

  describe('non-object responses', () => {
    it.each([
      ['string response'],
      [null],
      [undefined],
      [42]
    ])('handles %j by defaulting to false and empty payload', (response) => {
      const result = interpretStandardResult(response, defaults);
      expect(result).toMatchObject({
        success: false,
        message: defaults.failureMessage,
        error: defaults.failureMessage,
        payload: {},
        raw: response,
      });
    });
  });
});
