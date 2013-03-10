var Kat    = require('..');
var assert = require('assert');
var fs     = require('fs');
var path   = require('path');


var file1 = path.join(__dirname, 'files', 'file1.txt');
var file2 = path.join(__dirname, 'files', 'file2.txt');
var dir1  = path.join(__dirname, 'files', 'dir1');


describe('Set allowFiles to off', function() {
  describe('including a file', function() {
    it('Throws an error', function(done) {
      var kat = new Kat(dir1, file1, fs.createReadStream(file2), {
        allowFiles: false
      });

      kat.on('error', function(err) {
        assert.ok(err);
        assert.equal(err.message, 'Cannot add files');
        done();
      });

      kat.on('end', function() {
        throw new Error('should not end');
      });
      kat.resume();
    });
  });

  describe('not including a file', function() {
    it('Does not throw an error', function(done) {
      var kat = new Kat(dir1, fs.createReadStream(file2), {
        allowFiles: false
      });

      kat.on('end', done);
      kat.resume();
    });
  });
});


describe('Set allowDirs to off', function() {
  describe('including a directory', function() {
    it('Throws an error', function(done) {
      var kat = new Kat(dir1, file1, fs.createReadStream(file2), {
        allowDirs: false
      });

      kat.on('error', function(err) {
        assert.ok(err);
        assert.equal(err.message, 'Cannot add directories');
        done();
      });

      kat.on('end', function() {
        throw new Error('should not end');
      });
      kat.resume();
    });
  });

  describe('not including a directory', function() {
    it('Does not throw an error', function(done) {
      var kat = new Kat(file1, fs.createReadStream(file2), {
        allowDirs: false
      });

      kat.on('end', done);
      kat.resume();
    });
  });
});


describe('Set allowStreams to off', function() {
  describe('including a stream', function() {
    it('Throws an error', function(done) {
      var kat = new Kat(dir1, file1, fs.createReadStream(file2), {
        allowStreams: false
      });

      kat.on('error', function(err) {
        assert.ok(err);
        assert.equal(err.message, 'Cannot add streams');
        done();
      });

      kat.on('end', function() {
        throw new Error('should not end');
      });
      kat.resume();
    });
  });

  describe('not including a stream', function() {
    it('Does not throw an error', function(done) {
      var kat = new Kat(dir1, file1, {
        allowStreams: false
      });

      kat.on('end', done);
      kat.resume();
    });
  });
});
