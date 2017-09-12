var Kat    = require('..');
var assert = require('assert');
var fs     = require('fs');
var path   = require('path');


var file1 = path.join(__dirname, 'files', 'file1.txt');
var badfile = path.join(__dirname, 'files', 'idontexist!.what');
var file2 = path.join(__dirname, 'files', 'file2.txt');


describe('Try to concat a nonexistant file with continueOnErr', function() {
  describe('on', function() {
    it('Correctly emits data in order', function(done) {
      var kat = new Kat(file1, badfile, file2, { continueOnErr: true });

      var data = '';
      kat.on('data', function(chunk) {
        data += chunk.toString();
      });

      var err;
      kat.on('error', function(e) {
        err = e;
      });

      kat.on('end', function() {
        assert.ok(err);
        assert.equal(err.code, 'ENOENT');
        assert.equal(data, 'hello\nworld!!\n');
        done();
      });
    });

    describe('With a stream that emits an error', function() {
      it('Correctly emits data in order', function(done) {
        var stream = fs.createReadStream(badfile);
        var kat = new Kat(stream, file2, { continueOnErr: true });

        var data = '';
        kat.on('data', function(chunk) {
          data += chunk.toString();
        });

        var err;
        kat.on('error', function(e) {
          err = e;
        });

        kat.on('end', function() {
          assert.ok(err);
          assert.equal(err.code, 'ENOENT');
          assert.equal(data, 'world!!\n');
          done();
        });
      });
    });
  });

  describe('off', function() {
    it('Stops emitting on error', function(done) {
      var kat = new Kat(file1, badfile, file2);

      kat.on('error', function() {
        done();
      });

      // End should never be emitted.
      kat.on('end', function() {
        done(new Error('end should no be emitted!'));
      });
    });
  });
});
