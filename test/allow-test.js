const Kat    = require('..');
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');


const file1 = path.join(__dirname, 'files', 'file1.txt');
const file2 = path.join(__dirname, 'files', 'file2.txt');
const dir1  = path.join(__dirname, 'files', 'dir1');


describe('Set allowFiles to off', () => {
  describe('including a file', () => {
    it('Throws an error', (done) => {
      const kat = new Kat(dir1, file1, fs.createReadStream(file2), {
        allowFiles: false
      });

      kat.on('error', (err) => {
        assert.ok(err);
        assert.equal(err.message, 'Cannot add files');
        done();
      });

      kat.on('end', () => {
        throw Error('should not end');
      });
      kat.resume();
    });
  });

  describe('not including a file', () => {
    it('Does not throw an error', (done) => {
      const kat = new Kat(dir1, fs.createReadStream(file2), {
        allowFiles: false
      });

      kat.on('end', done);
      kat.resume();
    });
  });
});


describe('Set allowDirs to off', () => {
  describe('including a directory', () => {
    it('Throws an error', (done) => {
      const kat = new Kat(dir1, file1, fs.createReadStream(file2), {
        allowDirs: false
      });

      kat.on('error', (err) => {
        assert.ok(err);
        assert.equal(err.message, 'Cannot add directories');
        done();
      });

      kat.on('end', () => {
        throw Error('should not end');
      });
      kat.resume();
    });
  });

  describe('not including a directory', () => {
    it('Does not throw an error', (done) => {
      const kat = new Kat(file1, fs.createReadStream(file2), {
        allowDirs: false
      });

      kat.on('end', done);
      kat.resume();
    });
  });
});


describe('Set allowStreams to off', () => {
  describe('including a stream', () => {
    it('Throws an error', (done) => {
      const kat = new Kat(dir1, file1, fs.createReadStream(file2), {
        allowStreams: false
      });

      kat.on('error', (err) => {
        assert.ok(err);
        assert.equal(err.message, 'Cannot add streams');
        done();
      });

      kat.on('end', () => {
        throw Error('should not end');
      });
      kat.resume();
    });
  });

  describe('not including a stream', () => {
    it('Does not throw an error', (done) => {
      const kat = new Kat(dir1, file1, {
        allowStreams: false
      });

      kat.on('end', done);
      kat.resume();
    });
  });
});
