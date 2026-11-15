import assert from 'node:assert';
import fs from 'node:fs';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import Kat, { type KatFile } from '../src';

const file1 = path.join(__dirname, 'files', 'file1.txt');
const file2 = path.join(__dirname, 'files', 'file2.txt');
const file3 = path.join(__dirname, 'files', 'empty.txt');
const dir1 = path.join(__dirname, 'files', 'dir1');
const dir2 = path.join(__dirname, 'files', 'dir2');
const dir3 = path.join(__dirname, 'files', 'dir3');
const dir4 = path.join(__dirname, 'files', 'dir4');

describe('Concat 2 files', () => {
  it('Emits correct filesize data', (done) => {
    const kat = new Kat(file1, file2);

    kat.on('files', (files: KatFile[]) => {
      assert.deepEqual(files, [
        { path: file1, size: 6 },
        { path: file2, size: 8 },
      ]);
    });

    kat.on('end', done);
    kat.resume();
  });

  it('Correctly emits data in order', (done) => {
    const kat = new Kat(file1, file2);
    let data = '';

    kat.on('data', (chunk: Buffer | string) => {
      data += chunk.toString();
    });

    kat.on('end', () => {
      assert.equal(data, 'hello\nworld!!\n');
      done();
    });
  });

  describe('Use custom encoding', () => {
    it('Data matches encoding', (done) => {
      const kat = new Kat(file1, file2, { encoding: 'utf8' });

      kat.on('data', (data: Buffer | string) => {
        assert.ok(!Buffer.isBuffer(data));
        kat.destroy();
        done();
      });
    });
  });

  describe('passing in streams', () => {
    it('Emits correct filesize data', (done) => {
      const kat = new Kat(fs.createReadStream(file1), file2);

      kat.on('files', (files: KatFile[]) => {
        assert.deepEqual(files, [
          { path: file1, size: 6 },
          { path: file2, size: 8 },
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });

    it('Correctly emits data in order', (done) => {
      const kat = new Kat(fs.createReadStream(file1), file2);
      let data = '';

      kat.on('data', (chunk: Buffer | string) => {
        data += chunk.toString();
      });

      kat.on('end', () => {
        assert.equal(data, 'hello\nworld!!\n');
        done();
      });
    });

    describe('That is not a file stream', () => {
      it('Correctly concats', (done) => {
        const stream = new PassThrough();
        fs.createReadStream(file1).pipe(stream);
        const kat = new Kat(stream, file2);
        let data = '';

        kat.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });

        kat.on('end', () => {
          assert.equal(data, 'hello\nworld!!\n');
          done();
        });
      });

      it('Infers length from an HTTP stream', (done) => {
        const res = new IncomingMessage(new Socket());
        res.headers = { 'content-length': '6' };
        res.push(Buffer.from('hello\n'));
        res.push(null);
        const kat = new Kat(res, file2, { start: 2 });
        let data = '';
        let files: KatFile[] | undefined;

        kat.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });
        kat.on('files', (f: KatFile[]) => {
          files = f;
        });

        kat.on('end', () => {
          assert.equal(data, 'llo\nworld!!\n');
          assert.deepEqual(files, [
            { path: 0, size: 4 },
            { path: file2, size: 8 },
          ]);
          done();
        });
      });

      it('Skips start bytes from an unsized stream', (done) => {
        const stream = new PassThrough();
        stream.end('hello\n');
        const kat = new Kat(stream, file2, { start: 2 });
        let data = '';

        kat.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });

        kat.on('end', () => {
          assert.equal(data, 'llo\nworld!!\n');
          done();
        });
      });

      it('Infers length from a ranged file stream', (done) => {
        const kat = new Kat(fs.createReadStream(file1, { start: 2 }), file2);
        let data = '';
        let files: KatFile[] | undefined;

        kat.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });
        kat.on('files', (f: KatFile[]) => {
          files = f;
        });
        kat.on('end', () => {
          assert.equal(data, 'llo\nworld!!\n');
          assert.deepEqual(files, [
            { path: file1, size: 4 },
            { path: file2, size: 8 },
          ]);
          done();
        });
      });

      it('Infers length from a finite file stream range', (done) => {
        const kat = new Kat(
          fs.createReadStream(file1, { start: 1, end: 3 }),
          file2,
        );
        let data = '';

        kat.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });
        kat.on('end', () => {
          assert.equal(data, 'ellworld!!\n');
          done();
        });
      });

      it('Trims a known stream to the end option', (done) => {
        const kat = new Kat(fs.createReadStream(file1), file2, { end: 3 });
        let data = '';

        kat.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });
        kat.on('end', () => {
          assert.equal(data, 'hell');
          done();
        });
      });

      it('Trims decoded streams', (done) => {
        const kat = new Kat(
          fs.createReadStream(file1, { encoding: 'utf8' }),
          file2,
          { start: 2 },
        );
        let data = '';

        kat.on('data', (chunk: Buffer | string) => {
          data += chunk.toString();
        });
        kat.on('end', () => {
          assert.equal(data, 'llo\nworld!!\n');
          done();
        });
      });

      it('Skips a start position beyond the current data read', (done) => {
        const stream = new PassThrough();
        stream.write('he');
        const kat = new Kat(stream, file2, { start: 100 });
        const waitForCurrent = () => {
          const current = (kat as unknown as { _current?: unknown })._current;
          if (!current) {
            setTimeout(waitForCurrent, 0);
            return;
          }
          (
            kat as unknown as {
              _readStream: (current: unknown, size?: number) => void;
            }
          )._readStream(current, 1);
          kat.destroy();
          done();
        };
        setTimeout(waitForCurrent, 0);
      });

      it('Treats a partially read file stream as unsized', (done) => {
        const stream = fs.createReadStream(file1);
        stream.once('data', () => {
          stream.pause();
          const kat = new Kat(stream, file2);
          let data = '';

          kat.on('data', (chunk: Buffer | string) => {
            data += chunk.toString();
          });
          kat.on('end', () => {
            assert.equal(data, 'world!!\n');
            done();
          });
        });
      });
    });
  });
});

describe('Concat empty file', () => {
  it('Emits correct filesize data', (done) => {
    const kat = new Kat(file3);

    kat.on('files', (files: KatFile[]) => {
      assert.deepEqual(files, []);
    });

    kat.on('end', done);
    kat.resume();
  });

  describe('preceeded by non-empty file', () => {
    it('Emits correct filesize data', (done) => {
      const kat = new Kat(file1, file3);

      kat.on('files', (files: KatFile[]) => {
        assert.deepEqual(files, [{ path: file1, size: 6 }]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });

  describe('followed by non-empty file', () => {
    it('Emits correct filesize data', (done) => {
      const kat = new Kat(file3, file1);

      kat.on('files', (files: KatFile[]) => {
        assert.deepEqual(files, [{ path: file1, size: 6 }]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });

  describe('preceed and followed by empty files', () => {
    it('Emits correct filesize data', (done) => {
      const kat = new Kat(file3, file3, file3);

      kat.on('files', (files: KatFile[]) => {
        assert.deepEqual(files, []);
      });

      kat.on('end', done);
      kat.resume();
    });
  });

  describe('preceed and followed by non empty files', () => {
    it('Emits correct filesize data', (done) => {
      const kat = new Kat(file1, file3, file2);

      kat.on('files', (files: KatFile[]) => {
        assert.deepEqual(files, [
          { path: file1, size: 6 },
          { path: file2, size: 8 },
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });
});

describe('Concat a file and files inside a directory', () => {
  it('Emits correct filesize data', (done) => {
    const kat = new Kat();
    kat.add(file1, dir1, file2);

    kat.on('files', (files: KatFile[]) => {
      assert.deepEqual(files, [
        { path: file1, size: 6 },
        { path: path.join(dir1, 'a'), size: 4 },
        { path: path.join(dir1, 'b'), size: 4 },
        { path: path.join(dir1, 'c'), size: 4 },
        { path: file2, size: 8 },
      ]);
    });

    kat.on('end', done);
    kat.resume();
  });

  it('Data correctly ordered', (done) => {
    const kat = new Kat();
    kat.add(file1, dir1, file2);
    let data = '';

    kat.on('data', (chunk: Buffer | string) => {
      data += chunk.toString();
    });

    kat.on('end', () => {
      assert.equal(data, 'hello\n111\n222\n333\nworld!!\n');
      done();
    });
  });

  describe('that includes a subdirectory', () => {
    it('Emits correct filesize data', (done) => {
      const kat = new Kat();
      kat.add(file1, dir2, file2);

      kat.on('files', (files: KatFile[]) => {
        assert.deepEqual(files, [
          { path: file1, size: 6 },
          { path: path.join(dir2, 'a'), size: 4 },
          { path: path.join(dir2, 'b'), size: 4 },
          { path: path.join(dir2, 'c'), size: 4 },
          { path: path.join(dir2, 'subdir', 'foo.bar'), size: 7 },
          { path: path.join(dir2, 'subdir', 'hello.world'), size: 7 },
          { path: file2, size: 8 },
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });

    it('Data correctly ordered', (done) => {
      const kat = new Kat();
      kat.add(file1, dir2, file2);
      let data = '';

      kat.on('data', (chunk: Buffer | string) => {
        data += chunk.toString();
      });

      kat.on('end', () => {
        assert.equal(data, 'hello\n111\n222\n333\nlalala\nhahaha\nworld!!\n');
        done();
      });
    });
  });

  describe('Try reading a directory without permissions', () => {
    it('Emits an error', (done) => {
      fs.chmod(dir3, '000', (err) => {
        assert.ifError(err);
        const kat = new Kat(file1, dir3);
        kat.on('error', (e: NodeJS.ErrnoException) => {
          assert.ok(e);
          assert.equal(e.code, 'EACCES');
          fs.chmod(dir3, '777', done);
        });
      });
    });
  });

  describe('Add an empty directory', () => {
    it('Should not inclue directory in list of files', (done) => {
      const kat = new Kat();
      fs.mkdir(dir4, () => {
        kat.add(file1, dir4, file2);
      });

      kat.on('files', (files: KatFile[]) => {
        assert.deepEqual(files, [
          { path: file1, size: 6 },
          { path: file2, size: 8 },
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });

  describe('Module exports interop', () => {
    it('exposes Kat on Kat.Kat and Kat.default', () => {
      assert.strictEqual(Kat.Kat, Kat);
      assert.strictEqual(Kat.default, Kat);
    });
  });
});
