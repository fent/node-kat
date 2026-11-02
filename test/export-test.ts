import assert from 'node:assert';
import Kat, { Kat as NamedKat } from '..';

describe('Exports', () => {
  it('Exposes class as default and named export', () => {
    assert.strictEqual(Kat, NamedKat);
    assert.strictEqual(Kat.Kat, Kat);
    assert.strictEqual(Kat.default, Kat);
  });
});
