import assert from 'node:assert';
import path from 'node:path';
import Kat from '../src';

const file1 = path.join(__dirname, 'files', 'file1.txt');
const file2 = path.join(__dirname, 'files', 'file2.txt');

describe('Set autoEnd to off', () => {
  it('Does not end when done reading files', (done) => {
    const kat = new Kat(file1, { autoEnd: false });

    kat.once('close', (closedPath: string) => {
      assert.equal(closedPath, file1);
      setTimeout(kat.add.bind(kat, file2), 10);

      kat.once('close', (closedPath2: string) => {
        assert.equal(closedPath2, file2);
        done();
      });
    });

    kat.on('end', () => {
      throw new Error('should not end');
    });
    kat.resume();
  });
});
