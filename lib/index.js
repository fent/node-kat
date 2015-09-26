var Readable = require('stream').Readable;
var util     = require('util');
var fs       = require('fs');
var path     = require('path');
var Queue2   = require('queue2');


/**
 * @constructor
 * @extends {Readable}
 * @param {String|Readable|Stream} file... List of files to add
 *   when initiating.
 * @param {Object} options
 */
var Kat = module.exports = function() {
  // Default options.
  this.options = {
    start         : 0,
    end           : Infinity,
    concurrency   : 250,
    allowFiles    : true,
    allowDirs     : true,
    allowStreams  : true,
    continueOnErr : false,
    autoEnd       : true
  };

  // Check for options.
  var args = Array.prototype.slice.call(arguments);
  var last = args.pop();

  if (last) {
    if (typeof last !== 'string' && !isReadableStream(last)) {
      for (var key in this.options) {
        if (this.options.hasOwnProperty(key)) {
          if (last[key] === undefined) continue;
          this.options[key] = last[key];
        }
      }

      if (typeof this.options.start !== 'number') {
        throw new Error('start must be a number');
      }
      if (typeof this.options.end !== 'number') {
        throw new Error('end must be a number');
      }
      if (this.options.start > this.options.end) {
        throw new Error('start and end must be start <= end');
      }
      if (typeof this.options.concurrency !== 'number' ||
          this.options.concurrency <= 0) {
        throw new Error('concurrency must be a number and over 0');
      }

    } else {
      args.push(last);
    }
  }

  Readable.call(this, this.options);
  this.bytesRead = 0;
  this.pos = 0;
  this._sized = 0;


  // A queue for opening and reading a file's stats.
  var self = this;
  this._openQueue = new Queue2(function worker1(file, callback) {
    if (!self.readable) return callback();
    var world = this;

    if (typeof file === 'string') {
      fs.open(file, self.flags || 'r', self.mode || 438, function(err, fd) {
        if (err) return callback(err);

        fs.fstat(fd, function(err, stat) {
          if (err) return callback(err);

          if (stat.isFile()) {
            if (!world.injected && !self.options.allowFiles) {
              return callback(new Error('Cannot add files'));
            }

            self.emit('fd', fd, file);
            callback(null, true, file, fd, stat.size);

          } else if (stat.isDirectory()) {
            if (!self.options.allowDirs) {
              return callback(new Error('Cannot add directories'));
            }

            var noerr = true;
            var readdir = function readdir(err, files) {
              if (noerr && err) {
                noerr = false;
                return callback(err);
              }

              if (!files || !files.length) return;

              files = files.sort().map(function(f) {
                return path.join(file, f);
              });
              world.inject(files);
            };

            fs.readdir(file, readdir);
            fs.close(fd, readdir);
          }
        });
      });

    } else if (isReadableStream(file)) {
      if (isOldStyleStream(file)) {
        file.pause();
      }
      process.nextTick(function() {
        if (!self.options.allowStreams) {
          return callback(new Error('Cannot add streams'));
        }
        callback(null, false, file);
      });


    } else {
      callback(new Error('Invalid argument given: ' + file));
    }

  }, function worker2(isFile, file, fd, size, callback) {
    if (!file) {
      callback();
    } else if (isFile) {
      self._addFile(file, fd, size, callback);
    } else {
      self._addStream(file, false, callback);
    }

  }, this.options.concurrency);

  this._openQueue.on('error', function(err) {
    if (!self.options.continueOnErr) {
      self.readable = false;
      self._cleanup();
    }
    self.emit('error', err);
  });

  this._openQueue.on('drain', function() {
    process.nextTick(function() {
      if (self.options.autoEnd && self._openQueue.active === 0) {
        self._end();
      }
    });
  });

  this._queue = [];
  this._files = [];
  this._totalFiles = 0;

  // Call add with possible given files to read.
  if (args.length > 0) {
    this.add.apply(this, args);
  }
};

util.inherits(Kat, Readable);


/**
 * Adds a file, folder, or readable stream.
 *
 * @param {String|Readable|Stream} file...
 */
Kat.prototype.add = function() {
  if (!this.readable) throw new Error('Cannot add any more files');
  var self = this;

  for (var i = 0, len = arguments.length; i < len; i++) {
    var file = arguments[i];
    self._openQueue.push(file);
  }
};


/**
 * Addds a file from a given path.
 *
 * @param {String} file
 * @param {Number} fd
 * @param {Number} size
 * @param {Function(!Error)} callback
 */
Kat.prototype._addFile = function(file, fd, size, callback) {
  if (this._skip) return callback();
  var start = 0, end = Infinity;

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
    var newSize = this._sized + size;
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

  var options = {
    fd: fd,
    start: start,
    end: end
  };
  if (this.options.encoding) {
    options.encoding = this.options.encoding;
  }
  if (this.options.bufferSize) {
    options.bufferSize = this.options.bufferSize;
  }
  var rs = fs.createReadStream(file, options);
  this._addStream(rs, true, callback);
};


/**
 * Addds a readable stream.
 *
 * @param {Readable} stream
 * @param {Boolean} sized Wether or not this stream's size is known.
 * @param {Function(!Error)} callback
 */
Kat.prototype._addStream = function(stream, sized, callback) {
  // If no more data needs to be read, call callback right away.
  if (this.bytesRead > this.options.end) {
    return callback();
  }

  // Take note if the size of this stream is not known.
  if (!sized) this._uncertain = true;

  var self = this;
  var filepath = stream.path || this._totalFiles++;

  // Wether this stream is a file or not. Not set by openQueue because
  // of the possibility of directly adding a `fs.ReadStream`.
  var isFile = stream instanceof fs.ReadStream;

  // Check if this stream is using the old style API.
  if (isOldStyleStream(stream)) {
    var readable = new Readable();
    readable.wrap(stream);
    stream.resume();
    stream = readable;
  }

  var data = {
    // Keep track of how many bytes are read from this stream.
    bytesRead: 0,

    // Add to list of files.
    path: filepath,
    stream: stream,

    // Cleanup when this this stream ends, closes, errors,
    // or Kat is finished.
    cleanup: cleanup,

    // Note that stream is not yet readable until it fires
    // the `readable` event.
    readable: false,

    onend: onend
  };

  // When an error occurs, stop if `options.continueOnErr` is `false`.
  // Otherwise, treat this stream as if it ended
  // and continue to the next one.
  function onerr(err) {
    if (!self.options.continueOnErr) {
      self._cleanup(true);
    } else {
      onend();
    }

    self.emit('error', err);
  }
  stream.on('error', onerr);

  // Proxy `fd` and `close` events to this instance.
  function onfd(fd) {
    self.emit('fd', fd, data.path);
  }

  function onclose() {
    self.emit('close', data.path);
  }

  // Called to signal the next stream to begin reading.
  // Check if there is another stream in the queue,
  // if there isn't then we are finished.
  function onend() {
    cleanup();
    callback();

    // Add to list of files.
    if (data.bytesRead) {
      self._files.push({ path: data.path, size: data.bytesRead });
    }

    // Check if Kat has ended.
    if (self._ended) {
      self._end();

    } else  {
      var next = self._queue.shift();

      if (next) {
        self._addCurrentStream(next);
      } else if (self.options.autoEnd && self._openQueue.active === 0) {
        self._end();
      } else {
        delete self._current;
      }
    }
  }

  if (isFile) {
    stream.once('fd', onfd);
    stream.once('close', onclose);
  }
  stream.on('end', onend);

  function onreadable() {
    // Make note that it's readable so that `stream.read()` can be called
    // when it becomes the active stream.
    data.readable = true;
  }
  stream.on('readable', onreadable);

  // Cleanup all listeners when this stream is no longer needed.
  function cleanup(err) {
    stream.removeListener('error', onerr);
    stream.removeAllListeners('readable');
    if (isFile && err) {
      stream.removeListener('fd', onfd);
      stream.removeListener('close', onclose);
    }
    stream.removeListener('end', onend);
  }

  if (this._current) {
    // If another stream is active, add it to the queue.
    this._queue.push(data);

  } else {
    // Otherwise make this stream the current stream.
    this._addCurrentStream(data);
  }
};


/**
 * Add a stream and make it the currently active one.
 *
 * @param {Object} data
 *   {Number} bytesRead
 *   {String} path
 *   {Boolean} readable
 *   {Readable} stream
 *   {Function} cleanup
 */
Kat.prototype._addCurrentStream = function(data) {
  // Mark this stream as having been read from in order to
  // add it to the list of files later.
  data.read = true;
  this.emit('start', data.path);
  this._current = data;

  // Start reading from the stream right away.
  var size = this._waiting;
  delete this._waiting;
  this._readStream(size);
};


/**
 * Read method needed by the Readable class.
 *
 * @param {Number} size
 */
Kat.prototype._read = function(size) {
  if (this._current) {
    if (this._current.readable) {
      // If the current stream has already fired the `readable` event,
      // read from it right away.
      this._readStream(size);

    } else {
      // If not, wait until it does.
      var self = this;
      this._current.stream.once('readable', function onreadable() {
        self._readStream(size);
      });
    }

  } else {
    // If no stream has been added yet, note that `Kat#_read()` has
    // been called.
    this._waiting = size;
  }
};


/**
 * Read from the current stream. This is called when the `readable` event
 * has been fired on the current active stream.
 */
Kat.prototype._readStream = function(size) {
  var self = this;
  var oldPos = self.pos;

  // Check if reading the `size` amount of data would go over `end`.
  var newPos = self.pos + size;
  if (size && this.options.end < newPos) {
    // `end` is include, so the `- 1` is needed.
    size -= newPos - this.options.end - 1;
  }

  this._current.readable = false;
  var data = this._current.stream.read(size);

  if (data) {
    // Add data length to total bytes read.
    self.bytesRead += data.length;
    self.pos += data.length;

    // Check if there is any uncertainty if this data should be emitted
    // in case `start` and `end` options were given.
    if (oldPos >= self._sized) {

      // Check if `start` is in this data read.
      if (self.options.start > oldPos) {
        // Skip this data read if `start` is in a later one.
        if (self.options.start > self.pos) {
          this._waiting = size;
          this.push('');
          return;
        }

        var start = self.options.start - oldPos;
        data = data.slice(start);
      }

      // Check if end has been reached.
      if (self.options.end < oldPos) {
        return;
      }

      // Check if end position is in this data event.
      if (self.options.end < self.pos) {
        var end = self.options.end - oldPos + 1;
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
    if (self.options.end < self.pos) {
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
    this._current.stream.once('readable', function onreadable() {
      process.nextTick(function() {
        self._readStream(size);
      });
    });
  }
};


/**
 * Cleans up all streams including the ones in queue.
 */
Kat.prototype._cleanup = function() {
  this.readable = false;
  delete this._current;
  delete this._waiting;
  this._openQueue.die();

  this._queue.forEach(function(data) {
    data.cleanup();
  });
  this._queue = [];
};


/**
 * End stream.
 */
Kat.prototype._end = function() {
  if (!this.readable) { return; }
  this._cleanup();
  this.emit('files', this._files);
  this.push(null);
};


/**
 * Returns true if obj is a readable stream.
 *
 * @param {Object} obj
 */
function isReadableStream(obj) {
  return typeof obj === 'object' && typeof obj.pipe === 'function' &&
    typeof obj.readable === 'boolean' && obj.readable;
}


/**
 * Returns true if obj is an old style stream. From node v0.8 or older.
 *
 * @param {Readable|Stream} stream
 * @return {Boolean}
 */
function isOldStyleStream(stream) {
  return typeof stream.read !== 'function' ||
    typeof stream._read !== 'function' ||
    typeof stream.push !== 'function' ||
    typeof stream.unshift !== 'function' ||
    typeof stream.wrap !== 'function';
}
