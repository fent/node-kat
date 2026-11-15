import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Kat from '../src';

const file1 = path.join(__dirname, 'files', 'file1.txt');

describe('Call with incorrect options', () => {
  it('Throws type error', (done) => {
    assert.throws(() => {
      new Kat({ start: 'nope' as unknown as number });
    }, /start must be a number/);
    assert.throws(() => {
      new Kat({ end: 'nope' as unknown as number });
    }, /end must be a number/);
    assert.throws(() => {
      new Kat({ start: 2, end: 1 });
    }, /start and end must be start <= end/);
    assert.throws(() => {
      new Kat({ concurrency: {} as unknown as number });
    }, /concurrency must be a number and over 0/);
    assert.throws(() => {
      new Kat({ concurrency: -4 });
    }, /concurrency must be a number and over 0/);

    const kat = new Kat();
    kat.on('error', (err: Error) => {
      assert.ok(err);
      assert.ok(/Invalid argument given/.test(err.message));
      done();
    });
    kat.add(3 as unknown as string);
  });
});

describe('Add non-file and non-directory', () => {
  it('Emits an error', (done) => {
    const kat = new Kat();
    kat.on('error', (err: Error) => {
      assert.ok(err);
      assert.ok(
        /Path given must be either a file or directory/.test(err.message),
      );
      done();
    });
    kat.add('/dev/tty');
  });
});

describe('Add a stream that emits an error', () => {
  it('Kat also emits the error and stops', (done) => {
    const kat = new Kat(fs.createReadStream('dontexist'));
    kat.on('error', (err: NodeJS.ErrnoException) => {
      assert.ok(err);
      assert.equal(err.code, 'ENOENT');
      done();
    });
    kat.resume();
  });

  it('Handles a stream error while inferring length', (done) => {
    const kat = new Kat();
    const stream = fs.createReadStream(file1);
    const originalStat = fs.stat;
    let statCallback:
      | ((err: Error | null, stat?: fs.Stats) => void)
      | undefined;

    (
      fs as unknown as {
        stat: (
          file: fs.PathLike,
          callback: (err: Error | null, stat?: fs.Stats) => void,
        ) => void;
      }
    ).stat = (_file, callback) => {
      statCallback = callback;
    };

    (
      kat as unknown as {
        _openWorker: (
          context: { injected: boolean; inject: (list: string[]) => void },
          file: string | fs.ReadStream,
          callback: (err?: Error | null) => void,
        ) => void;
      }
    )._openWorker(
      { injected: false, inject: () => undefined },
      stream,
      (err?: Error | null) => {
        (fs as unknown as { stat: typeof fs.stat }).stat = originalStat;
        assert.equal(err?.message, 'early');
        statCallback?.(null, { isFile: () => true, size: 6 } as fs.Stats);
        stream.emit('error', new Error('again'));
        stream.destroy();
        done();
      },
    );

    setTimeout(() => stream.emit('error', new Error('early')), 0);
  });

  it('Kat emits an error from an already added stream', (done) => {
    const stream = fs.createReadStream(file1);
    const kat = new Kat(stream);
    kat.once('start', () => {
      stream.emit('error', new Error('late'));
    });
    kat.on('error', (err: Error) => {
      assert.equal(err.message, 'late');
      done();
    });
    kat.resume();
  });
});

describe('Try to add file after stream finishes', () => {
  it('Emits an error', (done) => {
    const kat = new Kat(file1);
    kat.on('end', () => {
      assert.throws(() => {
        kat.add('whatever');
      }, /Cannot add/);
      done();
    });
    kat.resume();
  });
});
