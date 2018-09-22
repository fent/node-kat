const Kat    = require('..');
const assert = require('assert');
const path   = require('path');


const file1 = path.join(__dirname, 'files', 'file1.txt');
const file2 = path.join(__dirname, 'files', 'file2.txt');


describe('Set autoEnd to off', () => {
  it('Does not end when done reading files', (done) => {
    const kat = new Kat(file1, { autoEnd: false });

    kat.once('close', (path) => {
      assert.equal(path, file1);
      setTimeout(kat.add.bind(kat, file2), 10);

      kat.once('close', (path) => {
        assert.equal(path, file2);
        done();
      });
    });

    kat.on('end', () => {
      throw Error('should not end');
    });
    kat.resume();
  });
});
