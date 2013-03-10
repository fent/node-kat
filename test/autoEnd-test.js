var Kat    = require('..');
var assert = require('assert');
var path   = require('path');


var file1 = path.join(__dirname, 'files', 'file1.txt');
var file2 = path.join(__dirname, 'files', 'file2.txt');


describe('Set autoEnd to off', function() {
  it('Does not end when done reading files', function(done) {
    var kat = new Kat(file1, { autoEnd: false });

    kat.once('close', function(path) {
      assert.equal(path, file1);
      setTimeout(kat.add.bind(kat, file2), 10);

      kat.once('close', function(path) {
        assert.equal(path, file2);
        done();
      });
    });

    kat.on('end', function() {
      throw new Error('should not end');
    });
    kat.resume();

  });
});
