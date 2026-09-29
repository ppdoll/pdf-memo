import { describe, expect, it } from 'vitest';
import { PdfPasswordError, isIncorrectPassword, passwordErrorKind } from '../errors';

describe('passwordErrorKind', () => {
  it('recognizes pdf.js password exceptions by name and code', () => {
    expect(passwordErrorKind({ name: 'PasswordException', code: 1 })).toBe('needed');
    expect(passwordErrorKind({ name: 'PasswordException', code: 2 })).toBe('incorrect');
    expect(passwordErrorKind({ name: 'PasswordException' })).toBe('needed');
  });

  it('ignores everything else', () => {
    expect(passwordErrorKind(new Error('Invalid PDF structure'))).toBeNull();
    expect(passwordErrorKind(null)).toBeNull();
    expect(passwordErrorKind('PasswordException')).toBeNull();
  });
});

describe('isIncorrectPassword', () => {
  it('matches the error class and plain objects that crossed a worker boundary', () => {
    expect(isIncorrectPassword(new PdfPasswordError())).toBe(true);
    expect(isIncorrectPassword({ name: 'PdfPasswordError' })).toBe(true);
    expect(isIncorrectPassword(new Error('boom'))).toBe(false);
  });
});
