const Kat    = require('..');
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const file1 = path.join(__dirname, 'files', 'file1.txt');

describe('Call with incorrect options', () => {
  it('Throws type error', (done) => {
    assert.throws(() => {
      new Kat({ start: 'nope' });
    }, /start must be a number/);
    assert.throws(() => {
      new Kat({ end: 'nope' });
    }, /end must be a number/);
    assert.throws(() => {
      new Kat({ start: 2, end: 1 });
    }, /start and end must be start <= end/);
    assert.throws(() => {
      new Kat({ concurrency: {} });
    }, /concurrency must be a number and over 0/);
    assert.throws(() => {
      new Kat({ concurrency: -4 });
    }, /concurrency must be a number and over 0/);

    var kat = new Kat();
    kat.on('error', (err) => {
      assert.ok(err);
      assert.ok(/Invalid argument given/.test(err.message));
      done();
    });
    kat.add(3);
  });
});

describe('Add non-file and non-directory', () => {
  it('Emits an error', (done) => {
    var kat = new Kat();
    kat.on('error', (err) => {
      assert.ok(err);
      assert.ok(
        /Path given must be either a file or directory/.test(err.message));
      done();
    });
    kat.add('/dev/tty');
  });
});

describe('Add a stream that emits an error', () => {
  it('Kat also emits the error and stops', (done) => {
    var kat = new Kat(fs.createReadStream('dontexist'));
    kat.on('error', (err) => {
      assert.ok(err);
      assert.equal(err.code, 'ENOENT');
      done();
    });
    kat.resume();
  });
});

describe('Try to add file after stream finishes', () => {
  it('Emits an error', (done) => {
    var kat = new Kat(file1);
    kat.on('end', () => {
      assert.throws(() => {
        kat.add('whatever');
      }, /Cannot add/);
      done();
    });
    kat.resume();
  });
});
