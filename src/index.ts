/// <reference path="./types/queue2.d.ts" />
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import Queue2 from 'queue2';

type KatOptions = Kat.KatOptions;
type KatFile = Kat.KatFile;
type StreamData = Kat.StreamData;

/**
 * Returns true if obj is a readable stream.
 */
const isReadableStream = (obj: unknown): obj is Readable => {
  const stream = obj as Partial<Readable> | null;
  return Boolean(
    stream &&
      typeof stream === 'object' &&
      typeof stream.pipe === 'function' &&
      typeof stream.readable === 'boolean' &&
      stream.readable,
  );
};

class Kat extends Readable {
  static Kat = Kat;
  static default = Kat;

  public override readable = true;
  public options: Required<KatOptions>;
  public bytesRead: number;
  public pos: number;
  private _sized: number;
  private _openQueue: Queue2;
  private _queue: StreamData[];
  private _files: KatFile[];
  private _totalFiles: number;
  private _skip?: boolean;
  private _uncertain?: boolean;
  private _ended?: boolean;
  private _current?: StreamData;
  private _waiting?: number;

  /**
   * @param files List of files to add on init.
   */
  constructor(...files: (string | Readable | KatOptions)[]) {
    // Default options.
    const options: Required<KatOptions> = {
      start: 0,
      end: Infinity,
      concurrency: 250,
      allowFiles: true,
      allowDirs: true,
      allowStreams: true,
      continueOnErr: false,
      autoEnd: true,
      flags: null,
      encoding: null,
      mode: null,
    };

    // Check for options..
    const last = files.pop();

    if (last) {
      // `last` could be an options object.
      if (
        typeof last === 'object' &&
        !Array.isArray(last) &&
        !isReadableStream(last)
      ) {
        Object.assign(options, last);
        if (typeof options.start !== 'number') {
          throw new Error('start must be a number');
        }
        if (typeof options.end !== 'number') {
          throw new Error('end must be a number');
        }
        if (options.start > options.end) {
          throw new Error('start and end must be start <= end');
        }
        if (
          typeof options.concurrency !== 'number' ||
          options.concurrency <= 0
        ) {
          throw new Error('concurrency must be a number and over 0');
        }
      } else {
        files.push(last);
      }
    }

    super({
      ...options,
      encoding: options.encoding ?? undefined,
    });
    this.options = options;
    this.bytesRead = 0;
    this.pos = 0;
    this._sized = 0;

    // A queue for opening and reading a file's stats.
    const kat = this;
    this._openQueue = new Queue2(
      function worker1(
        this: { injected: boolean; inject: (list: string[]) => void },
        file: string | Readable,
        callback: (
          err?: Error | null,
          isFile?: boolean,
          resFile?: string | Readable,
          size?: number,
        ) => void,
      ) {
        kat._openWorker(this, file, callback);
      },
      (
        isFile: boolean,
        file: string | Readable,
        size: number,
        callback: () => void,
      ) => {
        if (!file) {
          callback();
        } else if (isFile) {
          this._addFile(file as string, size, callback);
        } else {
          this._addStream(file as Readable, false, callback);
        }
      },
      this.options.concurrency,
    );

    this._openQueue.on('error', (err: Error) => {
      if (!this.options.continueOnErr) {
        this._cleanup();
      }
      this.emit('error', err);
    });

    this._openQueue.on('drain', () => {
      process.nextTick(() => {
        if (this.options.autoEnd && this._openQueue.active === 0) {
          this._end();
        }
      });
    });

    this._queue = [];
    this._files = [];
    this._totalFiles = 0;

    // Call add with possible given files to read.
    if (files.length > 0) {
      this.add(...(files as (string | Readable)[]));
    }
  }

  /**
   * Worker function for opening and statting a file/stream.
   *
   * @param context Queue worker context with inject method.
   */
  private _openWorker(
    context: { injected: boolean; inject: (list: string[]) => void },
    file: string | Readable,
    callback: (
      err?: Error | null,
      isFile?: boolean,
      resFile?: string | Readable,
      size?: number,
    ) => void,
  ): void {
    if (!this.readable) {
      callback();
      return;
    }

    if (typeof file === 'string') {
      fs.stat(file, (err, stat) => {
        if (err) {
          return callback(err);
        }

        if (stat.isFile()) {
          if (!context.injected && !this.options.allowFiles) {
            return callback(new Error('Cannot add files'));
          }

          callback(null, true, file, stat.size);
        } else if (stat.isDirectory()) {
          if (!this.options.allowDirs) {
            return callback(new Error('Cannot add directories'));
          }

          fs.readdir(file, (readdirErr, dirFiles) => {
            if (readdirErr) {
              return callback(readdirErr);
            }
            if (!dirFiles.length) {
              return callback();
            }

            const sorted = dirFiles.sort().map((f) => path.join(file, f));
            context.inject(sorted);
          });
        } else {
          callback(new Error('Path given must be either a file or directory'));
        }
      });
    } else if (isReadableStream(file)) {
      process.nextTick(() => {
        if (!this.options.allowStreams) {
          return callback(new Error('Cannot add streams'));
        }
        callback(null, false, file);
      });
    } else {
      callback(new Error(`Invalid argument given: ${file}`));
    }
  }

  /**
   * Adds a file, folder, or readable stream.
   */
  add(...args: (string | Readable)[]): void {
    if (!this.readable) {
      throw new Error('Cannot add any more files');
    }
    for (const file of args) {
      this._openQueue.push(file);
    }
  }

  /**
   * Adds a file from a given path.
   */
  private _addFile(file: string, size: number, callback: () => void): void {
    if (this._skip) {
      callback();
      return;
    }
    let start = 0;
    let end = Infinity;

    // Calculate start and end positions for this file.
    // Uncertain means that a stream was added before this file
    // which the size of is unknown.
    // Thus the position of the stream when it reaches this file
    // will be uncertain.
    if (!this._uncertain) {
      if (this.options.start > this._sized) {
        start = this.options.start - this._sized;
      }

      // If the end position is reached, make note of it.
      const newSize = this._sized + size;
      if (this.options.end <= newSize) {
        this._skip = true;
        end = this.options.end - this._sized;
      }

      this.pos += Math.min(start, size);

      // Add size to total.
      this._sized = newSize;

      // If no data will be read from this file, skip it.
      if (start >= size || (end !== Infinity && start >= end)) {
        callback();
        return;
      }
    }

    this._addStream(
      fs.createReadStream(file, {
        flags: this.options.flags || 'r',
        mode: this.options.mode || 438,
        encoding: this.options.encoding ?? undefined,
        start,
        end,
      }),
      true,
      callback,
    );
  }

  /**
   * Adds a readable stream.
   *
   * @param sized Whether or not this stream's size is known.
   */
  private _addStream(
    stream: Readable | fs.ReadStream,
    sized: boolean,
    callback: () => void,
  ): void {
    // Take note if the size of this stream is not known.
    if (!sized) {
      this._uncertain = true;
    }

    // Whether this stream is a file or not. Not set by openQueue because
    // of the possibility of directly adding a `fs.ReadStream`.
    const isFile = stream instanceof fs.ReadStream;
    const filepath: string | number = isFile
      ? String(stream.path)
      : this._totalFiles++;

    const data: StreamData = {
      // Keep track of how many bytes are read from this stream.
      bytesRead: 0,

      // Add to list of files.
      path: filepath,
      stream,

      // Stream is not yet readable until it fires
      // the `readable` event.
      readable: false,
    };

    // When an error occurs, stop if `options.continueOnErr` is `false`.
    // Otherwise, treat this stream as if it ended
    // and continue to the next one.
    let hasErr = false;
    const onerr = (err: Error) => {
      hasErr = true;
      if (!this.options.continueOnErr) {
        this._cleanup();
      } else {
        onend();
      }
      this.emit('error', err);
    };
    stream.on('error', onerr);

    // Proxy `fd` and `close` events to this instance.
    const onopen = (fd: number) => {
      this.emit('open', fd, data.path);
    };

    const onclose = () => {
      this.emit('close', data.path);
    };

    // Called to signal the next stream to begin reading.
    // Check if there is another stream in the queue,
    // if there isn't then we are finished.
    const onend = () => {
      cleanup();
      callback();

      // Add to list of files.
      if (data.bytesRead) {
        this._files.push({ path: data.path, size: data.bytesRead });
      }

      // Check if Kat has ended.
      if (this._ended) {
        this._end();
      } else {
        const next = this._queue.shift();

        if (next) {
          this._addCurrentStream(next);
        } else {
          delete this._current;
        }
      }
    };

    if (isFile) {
      stream.once('open', onopen);
      stream.once('close', onclose);
    }

    data.onend = onend;
    stream.on('end', onend);

    const onreadable = () => {
      // Make note that it's readable so that `stream.read()` can be called
      // when it becomes the active stream.
      data.readable = true;
    };
    stream.on('readable', onreadable);

    // Cleanup all listeners when this stream is no longer needed.
    const cleanup = () => {
      stream.removeListener('error', onerr);
      stream.removeListener('readable', onreadable);
      if (data.onreadable) {
        stream.removeListener('readable', data.onreadable);
      }
      if (isFile && hasErr) {
        stream.removeListener('open', onopen);
        stream.removeListener('close', onclose);
      }
      stream.removeListener('end', onend);
    };
    data.cleanup = cleanup;

    if (this._current) {
      // If another stream is active, add it to the queue.
      this._queue.push(data);
    } else {
      // Otherwise make this stream the current stream.
      this._addCurrentStream(data);
    }
  }

  /**
   * Add a stream and make it the currently active one.
   */
  private _addCurrentStream(data: StreamData): void {
    this.emit('start', data.path);
    this._current = data;

    // Start reading from the stream right away.
    const size = this._waiting;
    delete this._waiting;
    this._readStream(data, size);
  }

  /**
   * Read method needed by the Readable class.
   */
  override _read(size?: number): void {
    if (this._current) {
      const current = this._current;
      if (current.readable) {
        // If the current stream has already fired the `readable` event,
        // read from it right away.
        this._readStream(current, size);
      } else {
        // If not, wait until it does.
        current.onreadable = () => {
          this._readStream(current, size);
        };
        current.stream.once('readable', current.onreadable);
      }
    } else {
      // If no stream has been added yet, note that `Kat#_read()` has
      // been called.
      this._waiting = size;
    }
  }

  /**
   * Read from the current stream. This is called when the `readable` event
   * has been fired on the current active stream.
   */
  private _readStream(current: StreamData, size?: number): void {
    const oldPos = this.pos;

    // Check if reading the `size` amount of data would go over `end`.
    let readSize = size;
    if (readSize !== undefined) {
      const newPos = this.pos + readSize;
      if (readSize && this.options.end < newPos) {
        // `end` is inclusive, so the `- 1` is needed.
        readSize -= newPos - this.options.end - 1;
      }
    }

    current.readable = false;
    let data = current.stream.read(readSize);

    if (data) {
      // Add data length to total bytes read.
      this.bytesRead += data.length;
      this.pos += data.length;

      // Check if there is any uncertainty if this data should be emitted
      // in case `start` and `end` options were given.
      if (oldPos >= this._sized) {
        // Check if `start` is in this data read.
        if (this.options.start > oldPos) {
          // Skip this data read if `start` is in a later one.
          if (this.options.start > this.pos) {
            this._waiting = readSize;
            this.push('');
            return;
          }

          const start = this.options.start - oldPos;
          data = data.slice(start);
        }

        // Check if end position is in this data event.
        if (this.options.end < this.pos) {
          const end = this.options.end - oldPos + 1;
          data = data.slice(0, end);
        }
      }

      // Emit data to Kat instance.
      current.bytesRead += data.length;
      this.push(data);

      // Take note if less data was retrieved than requested.
      if (readSize && data.length < readSize) {
        this._waiting = readSize - data.length;
      }

      // End stream if end will be reached on this `data` event reached.
      if (this.options.end < this.pos) {
        this._ended = true;

        if (current.stream instanceof fs.ReadStream) {
          // If this is a file stream, close the file descriptor.
          current.stream.close();
        }

        // Call its `onend()` method right away
        // so it is not read any further.
        current.onend?.();
      }
    } else {
      current.onreadable = () => {
        process.nextTick(() => {
          this._read(size);
        });
      };
      current.stream.once('readable', current.onreadable);
    }
  }

  /**
   * Cleans up all streams including the ones in queue.
   */
  private _cleanup(): void {
    this.readable = false;
    delete this._current;
    delete this._waiting;
    this._openQueue.die();

    this._queue.forEach((data) => {
      data.cleanup?.();
    });
    this._queue = [];
  }

  /**
   * End stream.
   */
  private _end(): void {
    if (!this.readable) {
      return;
    }
    this._cleanup();
    this.emit('files', this._files);
    this.push(null);
  }

  /**
   * Destroys the stream and any remaining opened streams.
   */
  override destroy(): this {
    this._end();
    return this;
  }
}

namespace Kat {
  export interface KatOptions {
    start?: number;
    end?: number;
    concurrency?: number;
    allowFiles?: boolean;
    allowDirs?: boolean;
    allowStreams?: boolean;
    continueOnErr?: boolean;
    autoEnd?: boolean;
    flags?: string | null;
    encoding?: BufferEncoding | null;
    mode?: number | null;
  }

  export interface KatFile {
    path: string | number;
    size: number;
  }

  export interface StreamData {
    bytesRead: number;
    path: string | number;
    stream: Readable | fs.ReadStream;
    readable: boolean;
    onreadable?: () => void;
    onend?: () => void;
    cleanup?: () => void;
  }
}

// Statically recognizable exports for Node.js cjs-module-lexer (ESM named import support)
module.exports = Kat;
module.exports.default = Kat;
module.exports.Kat = Kat;

export = Kat;
