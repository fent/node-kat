var Kat    = require('..');
var assert = require('assert');
var fs     = require('fs');
var path   = require('path');

var file1 = path.join(__dirname, 'files', 'file1.txt');

describe('Call with incorrect options', function() {
  it('Throws type error', function(done) {
    assert.throws(function() {
      new Kat({ start: 'nope' });
    }, /start must be a number/);
    assert.throws(function() {
      new Kat({ end: 'nope' });
    }, /end must be a number/);
    assert.throws(function() {
      new Kat({ start: 2, end: 1 });
    }, /start and end must be start <= end/);
    assert.throws(function() {
      new Kat({ concurrency: {} });
    }, /concurrency must be a number and over 0/);
    assert.throws(function() {
      new Kat({ concurrency: -4 });
    }, /concurrency must be a number and over 0/);

    var kat = new Kat();
    kat.on('error', function(err) {
      assert.ok(err);
      assert.ok(/Invalid argument given/.test(err.message));
      done();
    });
    kat.add(3);
  });
});

describe('Add non-file and non-directory', function() {
  it('Emits an error', function(done) {
    var kat = new Kat();
    kat.on('error', function(err) {
      assert.ok(err);
      assert.ok(
        /Path given must be either a file or directory/.test(err.message));
      done();
    });
    kat.add('/dev/tty');
  });
});

describe('Add a stream that emits an error', function() {
  it('Kat also emits the error and stops', function(done) {
    var kat = new Kat(fs.createReadStream('dontexist'));
    kat.on('error', function(err) {
      assert.ok(err);
      assert.equal(err.code, 'ENOENT');
      done();
    });
    kat.resume();
  });
});

describe('Try to add file after stream finishes', function() {
  it('Emits an error', function(done) {
    var kat = new Kat(file1);
    kat.on('end', function() {
      assert.throws(function() {
        kat.add('whatever');
      }, /Cannot add/);
      done();
    });
    kat.resume();
  });
});
