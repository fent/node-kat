const Kat         = require('..');
const PassThrough = require('stream').PassThrough;
const assert      = require('assert');
const fs          = require('fs');
const path        = require('path');


const file1 = path.join(__dirname, 'files', 'file1.txt');
const file2 = path.join(__dirname, 'files', 'file2.txt');
const file3 = path.join(__dirname, 'files', 'empty.txt');
const dir1  = path.join(__dirname, 'files', 'dir1');
const dir2  = path.join(__dirname, 'files', 'dir2');
const dir3  = path.join(__dirname, 'files', 'dir3');
const dir4  = path.join(__dirname, 'files', 'dir4');


describe('Concat 2 files', () => {
  it('Emits correct filesize data', (done) => {
    var kat = new Kat(file1, file2);

    kat.on('files', (files) => {
      assert.deepEqual(files, [
        { path: file1, size: 6 },
        { path: file2, size: 8 }
      ]);
    });

    kat.on('end', done);
    kat.resume();
  });

  it('Correctly emits data in order', (done) => {
    var kat = new Kat(file1, file2);
    var data = '';

    kat.on('data', (chunk) => {
      data += chunk.toString();
    });

    kat.on('end', () => {
      assert.equal(data, 'hello\nworld!!\n');
      done();
    });
  });

  describe('Use custom encoding', () => {
    it('Data matches encoding', (done) => {
      var kat = new Kat(file1, file2, { encoding: 'utf8' });

      kat.on('data', (data) => {
        assert.ok(!Buffer.isBuffer(data));
        kat.destroy();
        done();
      });
    });
  });

  describe('passing in streams', () => {
    it('Emits correct filesize data', (done) => {
      var kat = new Kat(fs.createReadStream(file1), file2);

      kat.on('files', (files) => {
        assert.deepEqual(files, [
          { path: file1, size: 6 },
          { path: file2, size: 8 }
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });

    it('Correctly emits data in order', (done) => {
      var kat = new Kat(fs.createReadStream(file1), file2);
      var data = '';

      kat.on('data', (chunk) => {
        data += chunk.toString();
      });

      kat.on('end', () => {
        assert.equal(data, 'hello\nworld!!\n');
        done();
      });
    });

    describe('That is not a file stream', () => {
      it('Correctly concats', (done) => {
        var stream = new PassThrough();
        fs.createReadStream(file1).pipe(stream);
        var kat = new Kat(stream, file2);
        var data = '';

        kat.on('data', (chunk) => {
          data += chunk.toString();
        });

        kat.on('end', () => {
          assert.equal(data, 'hello\nworld!!\n');
          done();
        });
      });
    });
  });
});

describe('Concat empty file', () => {
  it('Emits correct filesize data', (done) => {
    var kat = new Kat(file3);

    kat.on('files', (files) => {
      assert.deepEqual(files, [
      ]);
    });

    kat.on('end', done);
    kat.resume();
  });

  describe('preceeded by non-empty file', () => {
    it('Emits correct filesize data', (done) => {
      var kat = new Kat(file1, file3);

      kat.on('files', (files) => {
        assert.deepEqual(files, [
          { path: file1, size: 6 }
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });

  describe('followed by non-empty file', () => {
    it('Emits correct filesize data', (done) => {
      var kat = new Kat(file3, file1);

      kat.on('files', (files) => {
        assert.deepEqual(files, [
          { path: file1, size: 6 }
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });

  describe('preceed and followed by empty files', () => {
    it('Emits correct filesize data', (done) => {
      var kat = new Kat(file3, file3, file3);

      kat.on('files', (files) => {
        assert.deepEqual(files, [
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });

  describe('preceed and followed by non empty files', () => {
    it('Emits correct filesize data', (done) => {
      var kat = new Kat(file1, file3, file2);

      kat.on('files', (files) => {
        assert.deepEqual(files, [
          { path: file1, size: 6 },
          { path: file2, size: 8 }
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });
});

describe('Concat a file and files inside a directory', () => {
  it('Emits correct filesize data', (done) => {
    var kat = new Kat();
    kat.add(file1, dir1, file2);

    kat.on('files', (files) => {
      assert.deepEqual(files, [
        { path: file1, size: 6 },
        { path: path.join(dir1, 'a'), size: 4 },
        { path: path.join(dir1, 'b'), size: 4 },
        { path: path.join(dir1, 'c'), size: 4 },
        { path: file2, size: 8 }
      ]);
    });

    kat.on('end', done);
    kat.resume();
  });

  it('Data correctly ordered', (done) => {
    var kat = new Kat();
    kat.add(file1, dir1, file2);
    var data = '';

    kat.on('data', (chunk) => {
      data += chunk.toString();
    });

    kat.on('end', () => {
      assert.equal(data, 'hello\n111\n222\n333\nworld!!\n');
      done();
    });
  });

  describe('that includes a subdirectory', () => {
    it('Emits correct filesize data', (done) => {
      var kat = new Kat();
      kat.add(file1, dir2, file2);

      kat.on('files', (files) => {
        assert.deepEqual(files, [
          { path: file1, size: 6 },
          { path: path.join(dir2, 'a'), size: 4 },
          { path: path.join(dir2, 'b'), size: 4 },
          { path: path.join(dir2, 'c'), size: 4 },
          { path: path.join(dir2, 'subdir', 'foo.bar'), size: 7 },
          { path: path.join(dir2, 'subdir', 'hello.world'), size: 7 },
          { path: file2, size: 8 }
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });

    it('Data correctly ordered', (done) => {
      var kat = new Kat();
      kat.add(file1, dir2, file2);
      var data = '';

      kat.on('data', (chunk) => {
        data += chunk.toString();
      });

      kat.on('end', () => {
        assert.equal(data,
          'hello\n111\n222\n333\nlalala\nhahaha\nworld!!\n');
        done();
      });
    });
  });

  describe('Try reading a directory without permissions', () => {
    it('Emits an error', (done) => {
      fs.chmod(dir3, '000', (err) => {
        if (err) { return done(err); }
        var kat = new Kat(file1, dir3);
        kat.on('error', (err) => {
          assert.ok(err);
          assert.equal(err.code, 'EACCES');
          fs.chmod(dir3, '777', done);
        });
      });
    });
  });

  describe('Add an empty directory', () => {
    it('Should not inclue directory in list of files', (done) => {
      var kat = new Kat();
      fs.mkdir(dir4, () => {
        kat.add(file1, dir4, file2);
      });

      kat.on('files', (files) => {
        assert.deepEqual(files, [
          { path: file1, size: 6 },
          { path: file2, size: 8 }
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });
});
