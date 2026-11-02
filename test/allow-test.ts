import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Kat from '../src';

const file1 = path.join(__dirname, 'files', 'file1.txt');
const file2 = path.join(__dirname, 'files', 'file2.txt');
const dir1 = path.join(__dirname, 'files', 'dir1');

const assertDoesNotEnd = (kat: Kat): void => {
  kat.on('end', () => {
    throw new Error('should not end');
  });
  kat.resume();
};

describe('Set allowFiles to off', () => {
  describe('including a file', () => {
    it('Throws an error', (done) => {
      const kat = new Kat(dir1, file1, fs.createReadStream(file2), {
        allowFiles: false,
      });

      kat.on('error', (err: Error) => {
        assert.ok(err);
        assert.equal(err.message, 'Cannot add files');
        done();
      });

      assertDoesNotEnd(kat);
    });
  });

  describe('not including a file', () => {
    it('Does not throw an error', (done) => {
      const kat = new Kat(dir1, fs.createReadStream(file2), {
        allowFiles: false,
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
        allowDirs: false,
      });

      kat.on('error', (err: Error) => {
        assert.ok(err);
        assert.equal(err.message, 'Cannot add directories');
        done();
      });

      assertDoesNotEnd(kat);
    });
  });

  describe('not including a directory', () => {
    it('Does not throw an error', (done) => {
      const kat = new Kat(file1, fs.createReadStream(file2), {
        allowDirs: false,
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
        allowStreams: false,
      });

      kat.on('error', (err: Error) => {
        assert.ok(err);
        assert.equal(err.message, 'Cannot add streams');
        done();
      });

      assertDoesNotEnd(kat);
    });
  });

  describe('not including a stream', () => {
    it('Does not throw an error', (done) => {
      const kat = new Kat(dir1, file1, {
        allowStreams: false,
      });

      kat.on('end', done);
      kat.resume();
    });
  });
});
