const Kat    = require('..');
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');


const file1 = path.join(__dirname, 'files', 'file1.txt');
const badfile = path.join(__dirname, 'files', 'idontexist!.what');
const file2 = path.join(__dirname, 'files', 'file2.txt');


describe('Try to concat a nonexistant file with continueOnErr', () => {
  describe('on', () => {
    it('Correctly emits data in order', (done) => {
      const kat = new Kat(file1, badfile, file2, { continueOnErr: true });

      let data = '';
      kat.on('data', (chunk) => {
        data += chunk.toString();
      });

      let err;
      kat.on('error', (e) => {
        err = e;
      });

      kat.on('end', () => {
        assert.ok(err);
        assert.equal(err.code, 'ENOENT');
        assert.equal(data, 'hello\nworld!!\n');
        done();
      });
    });

    describe('With a stream that emits an error', () => {
      it('Correctly emits data in order', (done) => {
        const stream = fs.createReadStream(badfile);
        const kat = new Kat(stream, file2, { continueOnErr: true });

        let data = '';
        kat.on('data', (chunk) => {
          data += chunk.toString();
        });

        let err;
        kat.on('error', (e) => {
          err = e;
        });

        kat.on('end', () => {
          assert.ok(err);
          assert.equal(err.code, 'ENOENT');
          assert.equal(data, 'world!!\n');
          done();
        });
      });
    });
  });

  describe('off', () => {
    it('Stops emitting on error', (done) => {
      const kat = new Kat(file1, badfile, file2);

      kat.on('error', () => {
        done();
      });

      // End should never be emitted.
      kat.on('end', () => {
        done(Error('end should no be emitted!'));
      });
    });
  });
});
