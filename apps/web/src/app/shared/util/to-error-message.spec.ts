import { toErrorMessage } from './to-error-message';

describe('toErrorMessage', () => {
  it('returns the message of an Error', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns a string input unchanged', () => {
    expect(toErrorMessage('plain text')).toBe('plain text');
  });

  it('returns the string message of a message-bearing object', () => {
    expect(toErrorMessage({ message: 'from object' })).toBe('from object');
  });

  it('falls back for objects without a string message and for null/undefined', () => {
    expect(toErrorMessage({ message: 42 })).toBe('An unexpected error occurred');
    expect(toErrorMessage(null)).toBe('An unexpected error occurred');
    expect(toErrorMessage(undefined)).toBe('An unexpected error occurred');
  });
});
