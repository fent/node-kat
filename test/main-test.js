var Kat    = require('..');
var assert = require('assert');
var fs     = require('fs');
var path   = require('path');


var file1 = path.join(__dirname, 'files', 'file1.txt');
var file2 = path.join(__dirname, 'files', 'file2.txt');
var file3 = path.join(__dirname, 'files', 'empty.txt');
var dir1  = path.join(__dirname, 'files', 'dir1');
var dir2  = path.join(__dirname, 'files', 'dir2');


describe('Concat 2 files', function() {
  it('Emits correct filesize data', function(done) {
    var kat = new Kat(file1, file2);

    kat.on('files', function(files) {
      assert.deepEqual(files, [
        { path: file1, size: 6 },
        { path: file2, size: 8 }
      ]);
    });

    kat.on('end', done);
    kat.resume();
  });

  it('Correctly emits data in order', function(done) {
    var kat = new Kat(file1, file2);
    var data = '';

    kat.on('data', function(chunk) {
      data += chunk.toString();
    });

    kat.on('end', function() {
      assert.equal(data, 'hello\nworld!!\n');
      done();
    });
  });

  describe('passing in streams', function() {
    it('Emits correct filesize data', function(done) {
      var kat = new Kat(fs.createReadStream(file1), file2);

      kat.on('files', function(files) {
        assert.deepEqual(files, [
          { path: file1, size: 6 },
          { path: file2, size: 8 }
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });

    it('Correctly emits data in order', function(done) {
      var kat = new Kat(fs.createReadStream(file1), file2);
      var data = '';

      kat.on('data', function(chunk) {
        data += chunk.toString();
      });

      kat.on('end', function() {
        assert.equal(data, 'hello\nworld!!\n');
        done();
      });
    });
  });
});

describe('Concat empty file', function() {
  it('Emits correct filesize data', function(done) {
    var kat = new Kat(file3);

    kat.on('files', function(files) {
      assert.deepEqual(files, [
      ]);
    });

    kat.on('end', done);
    kat.resume();
  });

  describe('preceeded by non-empty file', function() {
    it('Emits correct filesize data', function(done) {
      var kat = new Kat(file1, file3);

      kat.on('files', function(files) {
        assert.deepEqual(files, [
          { path: file1, size: 6 }
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });

  describe('followed by non-empty file', function() {
    it('Emits correct filesize data', function(done) {
      var kat = new Kat(file3, file1);

      kat.on('files', function(files) {
        assert.deepEqual(files, [
          { path: file1, size: 6 }
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });

  describe('preceed and followed by empty files', function() {
    it('Emits correct filesize data', function(done) {
      var kat = new Kat(file3, file3, file3);

      kat.on('files', function(files) {
        assert.deepEqual(files, [
        ]);
      });

      kat.on('end', done);
      kat.resume();
    });
  });

  describe('preceed and followed by non empty files', function() {
    it('Emits correct filesize data', function(done) {
      var kat = new Kat(file1, file3, file2);

      kat.on('files', function(files) {
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

describe('Concat a file and files inside a directory', function() {
  it('Emits correct filesize data', function(done) {
    var kat = new Kat();
    kat.add(file1, dir1, file2);

    kat.on('files', function(files) {
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

  it('Data correctly ordered', function(done) {
    var kat = new Kat();
    kat.add(file1, dir1, file2);
    var data = '';

    kat.on('data', function(chunk) {
      data += chunk.toString();
    });

    kat.on('end', function() {
      assert.equal(data, 'hello\n111\n222\n333\nworld!!\n');
      done();
    });
  });

  describe('that includes a subdirectory', function() {
    it('Emits correct filesize data', function(done) {
      var kat = new Kat();
      kat.add(file1, dir2, file2);

      kat.on('files', function(files) {
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

    it('Data correctly ordered', function(done) {
      var kat = new Kat();
      kat.add(file1, dir2, file2);
      var data = '';

      kat.on('data', function(chunk) {
        data += chunk.toString();
      });

      kat.on('end', function() {
        assert.equal(data,
                     'hello\n111\n222\n333\nlalala\nhahaha\nworld!!\n');
        done();
      });
    });
  });

});
