import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import Kat from '../src';

const file1 = path.join(__dirname, 'files', 'file1.txt');
const badfile = path.join(__dirname, 'files', 'idontexist!.what');
const file2 = path.join(__dirname, 'files', 'file2.txt');

describe('Try to concat a nonexistant file with continueOnErr', () => {
  describe('on', () => {
    it('Correctly emits data in order', (done) => {
      const kat = new Kat(file1, badfile, file2, { continueOnErr: true });

      let data = '';
      kat.on('data', (chunk: Buffer | string) => {
        data += chunk.toString();
      });

      let err: NodeJS.ErrnoException | undefined;
      kat.on('error', (e: NodeJS.ErrnoException) => {
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
        kat.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });

        let err: NodeJS.ErrnoException | undefined;
        kat.on('error', (e: NodeJS.ErrnoException) => {
          err = e;
        });

        kat.on('end', () => {
          assert.ok(err);
          assert.equal(err.code, 'ENOENT');
          assert.equal(data, 'world!!\n');
          done();
        });
      });

      it('Continues after an added stream errors', (done) => {
        const stream = new PassThrough();
        const kat = new Kat(stream, file2, { continueOnErr: true });
        let data = '';
        let err: Error | undefined;

        kat.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });
        kat.once('start', () => {
          process.nextTick(() => stream.emit('error', new Error('late')));
        });
        kat.on('error', (e: Error) => {
          err = e;
        });
        kat.on('end', () => {
          assert.ok(err);
          assert.equal(err.message, 'late');
          assert.equal(data, 'world!!\n');
          done();
        });
      });

      it('Handles a stream error before length inference finishes', (done) => {
        const originalStat = fs.stat;
        const stream = fs.createReadStream(file1);
        (
          fs as unknown as {
            stat: (
              file: fs.PathLike,
              callback: (err: Error | null, stat?: fs.Stats) => void,
            ) => void;
          }
        ).stat = (file, callback) => {
          if (file === stream.path) {
            setTimeout(() => {
              (fs as unknown as { stat: typeof fs.stat }).stat = originalStat;
              callback(null, { isFile: () => true, size: 6 } as fs.Stats);
            }, 20);
          } else {
            originalStat(file, callback);
          }
        };

        const kat = new Kat(stream, file2, { continueOnErr: true });
        let data = '';
        let err: Error | undefined;
        kat.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });
        kat.on('error', (e: Error) => {
          err = e;
        });
        kat.on('end', () => {
          stream.destroy();
          assert.ok(err);
          assert.equal(err.message, 'early');
          assert.equal(data, 'world!!\n');
          setTimeout(done, 30);
        });

        setTimeout(() => stream.emit('error', new Error('early')), 0);
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
        done(new Error('end should no be emitted!'));
      });
    });
  });
});
