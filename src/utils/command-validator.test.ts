
import { describe, it, expect } from 'vitest';
import { CommandValidator } from './command-validator.js';

describe('CommandValidator', () => {



    it('blocks dangerous commands', () => {
        expect(() => CommandValidator.validate('quit')).toThrow(/Dangerous command blocked/);
        expect(() => CommandValidator.validate('exit')).toThrow(/Dangerous command blocked/);
        expect(() => CommandValidator.validate('crash')).toThrow(/Dangerous command blocked/);
    });

    it('blocks dangerous commands with whitespace', () => {
        expect(() => CommandValidator.validate('quit ')).toThrow(/Dangerous command blocked/);
        expect(() => CommandValidator.validate(' quit')).toThrow(/Dangerous command blocked/);
        expect(() => CommandValidator.validate('quit\t')).toThrow(/Dangerous command blocked/);
    });

    it('blocks forbidden tokens', () => {
        expect(() => CommandValidator.validate('start "cmd"')).toThrow(/contains unsafe/);
    });

    it('allows safe commands', () => {
        expect(() => CommandValidator.validate('stat fps')).not.toThrow();
        expect(() => CommandValidator.validate('viewmode lit')).not.toThrow();
    });


});
