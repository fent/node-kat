const Readable = require('stream').Readable;
const fs       = require('fs');
const path     = require('path');
const Queue2   = require('queue2');


/**
 * Returns true if obj is a readable stream.
 *
 * @param {Object} obj
 */
const isReadableStream = (obj) => {
  return typeof obj === 'object' && typeof obj.pipe === 'function' &&
    typeof obj.readable === 'boolean' && obj.readable;
};


module.exports = class Kat extends Readable {
  /**
   * @constructor
   * @extends {Readable}
   * @param {string|Readable|Stream} ...file List of files to add on init.
   * @param {Object} options
   */
  constructor(...files) {
    // Default options.
    const options = {
      start         : 0,
      end           : Infinity,
      concurrency   : 250,
      allowFiles    : true,
      allowDirs     : true,
      allowStreams  : true,
      continueOnErr : false,
      autoEnd       : true,
      flags         : null,
      encoding      : null,
      mode          : null,
    };

    // Check for options..
    const last = files.pop();

    if (last) {
      // `last` could be an options object.
      if (typeof last === 'object' && !Array.isArray(last) &&
          !isReadableStream(last)) {
        Object.assign(options, last);
        if (typeof options.start !== 'number') {
          throw Error('start must be a number');
        }
        if (typeof options.end !== 'number') {
          throw Error('end must be a number');
        }
        if (options.start > options.end) {
          throw Error('start and end must be start <= end');
        }
        if (typeof options.concurrency !== 'number' ||
            options.concurrency <= 0) {
          throw Error('concurrency must be a number and over 0');
        }

      } else {
        files.push(last);
      }
    }

    super(options);
    this.options = options;
    this.bytesRead = 0;
    this.pos = 0;
    this._sized = 0;


    // A queue for opening and reading a file's stats.
    let self = this;
    this._openQueue = new Queue2(function worker1(file, callback) {
      if (!self.readable) { return callback(); }

      if (typeof file === 'string') {
        fs.stat(file, (err, stat) => {
          if (err) { return callback(err); }

          if (stat.isFile()) {
            if (!this.injected && !self.options.allowFiles) {
              return callback(Error('Cannot add files'));
            }

            callback(null, true, file, stat.size);

          } else if (stat.isDirectory()) {
            if (!self.options.allowDirs) {
              return callback(Error('Cannot add directories'));
            }

            fs.readdir(file, (err, files) => {
              if (err) { return callback(err); }
              if (!files.length) { return callback(); }

              files = files.sort().map(f => path.join(file, f));
              this.inject(files);
            });
          } else {
            callback(Error('Path given must be either a file or directory'));
          }
        });

      } else if (isReadableStream(file)) {
        process.nextTick(() => {
          if (!self.options.allowStreams) {
            return callback(Error('Cannot add streams'));
          }
          callback(null, false, file);
        });


      } else {
        callback(Error('Invalid argument given: ' + file));
      }

    }, (isFile, file, size, callback) => {
      if (!file) {
        callback();
      } else if (isFile) {
        this._addFile(file, size, callback);
      } else {
        this._addStream(file, false, callback);
      }

    }, this.options.concurrency);

    this._openQueue.on('error', (err) => {
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
      this.add(...files);
    }
  }


  /**
   * Adds a file, folder, or readable stream.
   *
   * @param {string|Readable|Stream} ...file
   */
  add(...args) {
    if (!this.readable) { throw Error('Cannot add any more files'); }
    for (let file of args) {
      this._openQueue.push(file);
    }
  }


  /**
   * Addds a file from a given path.
   *
   * @param {string} file
   * @param {number} size
   * @param {Function(!Error)} callback
   */
  _addFile(file, size, callback) {
    if (this._skip) { return callback(); }
    let start = 0, end = Infinity;

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
      if (start >= size || end && start >= end) {
        return callback();
      }
    }

    this._addStream(fs.createReadStream(file, {
      flags: this.options.flags || 'r',
      mode: this.options.mode || 438,
      encoding: this.options.encoding,
      start,
      end,
    }), true, callback);
  }


  /**
   * Addds a readable stream.
   *
   * @param {Readable} stream
   * @param {boolean} sized Wether or not this stream's size is known.
   * @param {Function(!Error)} callback
   */
  _addStream(stream, sized, callback) {
    // Take note if the size of this stream is not known.
    if (!sized) { this._uncertain = true; }

    const filepath = stream.path || this._totalFiles++;

    // Wether this stream is a file or not. Not set by openQueue because
    // of the possibility of directly adding a `fs.ReadStream`.
    const isFile = stream instanceof fs.ReadStream;

    const data = {
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
    const onerr = (err) => {
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
    const onopen = (fd) => {
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

      } else  {
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
   *
   * @param {Object} data
   * @param {number} data.bytesRead
   * @param {string} data.path
   * @param {boolean} data.readable
   * @param {Readable} data.stream
   * @param {Function} data.cleanup
   */
  _addCurrentStream(data) {
    this.emit('start', data.path);
    this._current = data;

    // Start reading from the stream right away.
    const size = this._waiting;
    delete this._waiting;
    this._readStream(size);
  }


  /**
   * Read method needed by the Readable class.
   *
   * @param {number} size
   */
  _read(size) {
    if (this._current) {
      if (this._current.readable) {
        // If the current stream has already fired the `readable` event,
        // read from it right away.
        this._readStream(size);

      } else {
        // If not, wait until it does.
        this._current.onreadable = () => {
          this._readStream(size);
        };
        this._current.stream.once('readable', this._current.onreadable);
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
   *
   * @param {number} size
   */
  _readStream(size) {
    const oldPos = this.pos;

    // Check if reading the `size` amount of data would go over `end`.
    const newPos = this.pos + size;
    if (size && this.options.end < newPos) {
      // `end` is include, so the `- 1` is needed.
      size -= newPos - this.options.end - 1;
    }

    this._current.readable = false;
    let data = this._current.stream.read(size);

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
            this._waiting = size;
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
      this._current.bytesRead += data.length;
      this.push(data);

      // Take note if less data was retrieved than requested.
      if (size && data.length < size) {
        this._waiting = size - data.length;
      }

      // End stream if end will be reached on this `data` event reached.
      if (this.options.end < this.pos) {
        this._ended = true;

        if (typeof this._current.stream.close === 'function') {
          // If this is a file stream, close the file descripter.
          this._current.stream.close();
        }

        // Call its `onend()` method right away
        // so it is not read any further.
        this._current.onend();
      }

    } else {
      this._current.onreadable = () => {
        process.nextTick(() => {
          this._read(size);
        });
      };
      this._current.stream.once('readable', this._current.onreadable);
    }
  }


  /**
   * Cleans up all streams including the ones in queue.
   */
  _cleanup() {
    this.readable = false;
    delete this._current;
    delete this._waiting;
    this._openQueue.die();

    this._queue.forEach((data) => {
      data.cleanup();
    });
    this._queue = [];
  }


  /**
   * End stream.
   */
  _end() {
    if (!this.readable) { return; }
    this._cleanup();
    this.emit('files', this._files);
    this.push(null);
  }


  /**
   * Destroys the stream and any remaining opened streams.
   */
  destroy() {
    this._end();
  }
};
