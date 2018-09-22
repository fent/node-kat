const Kat         = require('..');
const PassThrough = require('stream').PassThrough;
const assert      = require('assert');
const fs          = require('fs');
const path        = require('path');


const file1 = path.join(__dirname, 'files', 'file1.txt');
const file2 = path.join(__dirname, 'files', 'file2.txt');
const file3 = path.join(__dirname, 'files', 'dog.log');


// Macro.
const macro = (...args) => {
  const expectedFiles = args.pop();
  const expectedData = args.pop();
  const options = args.pop();
  let files;

  // Pause possible given streams.
  args.forEach((f) => { if (f.pause) f.pause(); });

  return () => {
    it('Data matches', (done) => {
      const kat = new Kat(options);
      kat.add(...args);

      let data = '';
      kat.on('data', (chunk) => {
        data += chunk.toString();
      });

      kat.on('files', (f) => {
        files = f;
      });

      kat.on('end', () => {
        assert.equal(data, expectedData);
        done();
      });
    });

    it('Returns correct file data', () => {
      assert.ok(files, '`files` event not fired');
      assert.ok(Array.isArray(files), '`files` must be an array');
      assert.deepEqual(files, expectedFiles);
    });
  };
};


describe('Set start', () => {
  describe('in the 1st file',
    macro(file1, file2, { start: 2 }, 'llo\nworld!!\n', [
      { path: file1, size: 4 },
      { path: file2, size: 8 }
    ]));

  describe('in the 1st file with stream in the', () => {
    describe('beginning', macro(fs.createReadStream(file1), file2, file3,
      { start: 2 }, 'llo\nworld!!\ndog\n', [
        { path: file1, size: 4 },
        { path: file2, size: 8 },
        { path: file3, size: 4 }
      ]));

    describe('middle', macro(file1, fs.createReadStream(file2), file3,
      { start: 2 }, 'llo\nworld!!\ndog\n', [
        { path: file1, size: 4 },
        { path: file2, size: 8 },
        { path: file3, size: 4 }
      ]));

    describe('end', macro(file1, file2, fs.createReadStream(file3),
      { start: 2 }, 'llo\nworld!!\ndog\n', [
        { path: file1, size: 4 },
        { path: file2, size: 8 },
        { path: file3, size: 4 }
      ]));

  });

  describe('inbetween the 1st and 2nd file',
    macro(file1, file2, file3, { start: 6 }, 'world!!\ndog\n', [
      { path: file2, size: 8 },
      { path: file3, size: 4 }
    ]));

  describe('inbetween the 1st and 2nd file with stream in the', () => {

    describe('beginning',
      macro(fs.createReadStream(file1), file2, file3, { start: 6 },
        'world!!\ndog\n', [
          { path: file2, size: 8 },
          { path: file3, size: 4 }
        ]));

    describe('middle',
      macro(file1, fs.createReadStream(file2), file3, { start: 6 },
        'world!!\ndog\n', [
          { path: file2, size: 8 },
          { path: file3, size: 4 }
        ]));

    describe('end',
      macro(file1, file2, fs.createReadStream(file3), { start: 6 },
        'world!!\ndog\n', [
          { path: file2, size: 8 },
          { path: file3, size: 4 }
        ]));

  });

  describe('in the 2nd file',
    macro(file1, file2, { start: 7 }, 'orld!!\n', [
      { path: file2, size: 7 }
    ]));

  describe('in the 2nd file with stream in the', () => {

    describe('beginning', macro(fs.createReadStream(file1), file2, file3,
      { start: 7 }, 'orld!!\ndog\n', [
        { path: file2, size: 7 },
        { path: file3, size: 4 }
      ]));

    describe('middle', macro(file1, fs.createReadStream(file2), file3,
      { start: 7 }, 'orld!!\ndog\n', [
        { path: file2, size: 7 },
        { path: file3, size: 4 }
      ]));

    describe('end', macro(file1, file2, fs.createReadStream(file3),
      { start: 7 }, 'orld!!\ndog\n', [
        { path: file2, size: 7 },
        { path: file3, size: 4 }
      ]));

  });

});


describe('Set end', () => {
  describe('in the 1st file',
    macro(file1, file2, { end: 3 }, 'hell', [
      { path: file1, size: 4 }
    ]));

  describe('in the 1st file with stream in the', () => {
    const stream = new PassThrough();
    fs.createReadStream(file1).pipe(stream);
    describe('beginning', macro(stream, file2, file3,
      { end: 3 }, 'hell', [
        { path: 0, size: 4 }
      ]));

    describe('middle', macro(file1, fs.createReadStream(file2), file3,
      { end: 3 }, 'hell', [
        { path: file1, size: 4 }
      ]));

    describe('end', macro(file1, file2, fs.createReadStream(file3),
      { end: 3 }, 'hell', [
        { path: file1, size: 4 }
      ]));

  });

  describe('inbetween the 1st and 2nd file',
    macro(file1, file2, file3, { end: 5 }, 'hello\n', [
      { path: file1, size: 6 }
    ]));

  describe('inbetween the 1st and 2nd file with stream in the', () => {

    describe('beginning', macro(fs.createReadStream(file1), file2, file3,
      { end: 5 }, 'hello\n', [
        { path: file1, size: 6 }
      ]));

    describe('middle', macro(file1, fs.createReadStream(file2), file3,
      { end: 5 }, 'hello\n', [
        { path: file1, size: 6 }
      ]));

    describe('end', macro(file1, file2, fs.createReadStream(file3),
      { end: 5 }, 'hello\n', [
        { path: file1, size: 6 }
      ]));

  });

  describe('in the 2nd file',
    macro(file1, file2, { end: 8 }, 'hello\nwor', [
      { path: file1, size: 6 },
      { path: file2, size: 3 }
    ]));

  describe('in the 2nd file with stream in the', () => {

    describe('beginning', macro(fs.createReadStream(file1), file2, file3,
      { end: 10 }, 'hello\nworld', [
        { path: file1, size: 6 },
        { path: file2, size: 5 }
      ]));

    describe('middle', macro(file1, fs.createReadStream(file2), file3,
      { end: 10 }, 'hello\nworld', [
        { path: file1, size: 6 },
        { path: file2, size: 5 }
      ]));

    describe('end', macro(file1, file2, fs.createReadStream(file3),
      { end: 10 }, 'hello\nworld', [
        { path: file1, size: 6 },
        { path: file2, size: 5 }
      ]));

  });

});


describe('Set both start and end', () => {
  describe('from 1st file to 3rd',
    macro(file1, file2, file3, { start: 2, end: 15 },
      'llo\nworld!!\ndo', [
        { path: file1, size: 4 },
        { path: file2, size: 8 },
        { path: file3, size: 2 }
      ]));

  describe('from 1st file to 3rd with stream in the', () => {

    describe('beginning', macro(fs.createReadStream(file1), file2, file3,
      { start: 2, end: 15 }, 'llo\nworld!!\ndo', [
        { path: file1, size: 4 },
        { path: file2, size: 8 },
        { path: file3, size: 2 }
      ]));

    describe('middle', macro(file1, fs.createReadStream(file2), file3,
      { start: 2, end: 15 }, 'llo\nworld!!\ndo', [
        { path: file1, size: 4 },
        { path: file2, size: 8 },
        { path: file3, size: 2 }
      ]));

    describe('end', macro(file1, file2, fs.createReadStream(file3),
      { start: 2, end: 15 }, 'llo\nworld!!\ndo', [
        { path: file1, size: 4 },
        { path: file2, size: 8 },
        { path: file3, size: 2 }
      ]));

  });

  describe('skipping 1st and 3rd files',
    macro(file1, file2, file3, { start: 6, end: 13 },
      'world!!\n', [{ path: file2, size: 8 }]));

  describe('skipping 1st and 3rd files with a stream in the', () => {

    describe('beginning', macro(fs.createReadStream(file1), file2, file3,
      { start: 6, end: 13 }, 'world!!\n', [
        { path: file2, size: 8 }
      ]));

    describe('middle', macro(file1, fs.createReadStream(file2), file3,
      { start: 6, end: 13 }, 'world!!\n', [
        { path: file2, size: 8 }
      ]));

    describe('end', macro(file1, file2, fs.createReadStream(file3),
      { start: 6, end: 13 }, 'world!!\n', [
        { path: file2, size: 8 }
      ]));

  });

});
