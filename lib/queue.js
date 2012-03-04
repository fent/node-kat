var EventEmitter = require('events').EventEmitter
  , util = require('util')


//
// ### Q(worker, c)
// @param worker (function)
// @param concurrency (number) Number of parallel workers
//
var Q = module.exports = function(worker, concurrency) {
  EventEmitter.call(this);

  this.worker = worker;
  this.concurrency = concurrency;
  this.workers = 0;
  this.num = 0;
  this.current = 0;
  this.queue = [];
  this.running = [];
  this.waiting = [];
};

util.inherits(Q, EventEmitter);


//
// ### Q#push(data)
// Add new job to queue
//
Q.prototype.push = function(data) {
  this.queue.push({ num: this.num++, data: data });
  this._next();
};


//
// ### Q#inject(data, num)
// Adds a job in place of another running job
//
Q.prototype.inject = function(list, num) {
  var i, len = list.length, len2 = len - 1;
  this.workers--;

  // edit order of items in queue and running
  if (len2 > 0) {
    this._incrAll(num, len2);
  }

  // inject items to the beginning of queue
  // with custom priority
  for (i = len - 1; i >= 0; i--) {
    this.queue.unshift({ num: num + i, data: list[i] });
    this._next(true);
  }
};


//
// ### Q@incrAll(num, amount)
// Increases `num` of all lists by given amount 
//
Q.prototype._incrAll = function(num, amount) {
  this._incr('queue', num, amount);
  this._incr('running', num, amount);
  this._incr('waiting', num, amount);
};


//
// ### Q#_incr(list, num, amount)
// Increases `num` in jobs by given amount
//
Q.prototype._incr = function(list, num, amount) {
  for (var i = 0, len = this[list].length; i < len; i++) {
    var job = this[list][i];
    if (job.num > num) job.num += amount;
  }
};


//
// ### Q#_next()
// Processes jobs in queue if it can
//
Q.prototype._next = function(injected) {
  if (this.workers >= this.concurrency) return;

  var job = this.queue.shift();
  if (!job) return this.emit('drain');

  this.running.push(job);
  this.workers++;
  var self = this;
  var world = { num: job.num, injected: injected };

  self.worker.call(world, job.data, function(obj) {
    self.running.splice(self.running.indexOf(job), 1);

    if (obj instanceof Error) {
      self.emit('error', obj);
      self._incrAll(job.num, -1);
      self._down();

    } else if (typeof obj === 'function') {
      self.waiting.push({ num: job.num, fn: obj });
      self._process();

    } else if (Array.isArray(obj)) {
      self.inject(obj, job.num);
    }
  });
};


//
// ### Q#process()
// Processes the waiting list in order
//
Q.prototype._process = function() {
  for (var i = 0, len = this.waiting.length; i < len; i++) {
    var job = this.waiting[i];
    if (job.num === this.current) {
      this.current++;
      this.waiting.splice(i, 1);
      job.fn(this._down.bind(this));
      return this._process();
    }
  }
};


//
// ### Q#_down()
// Frees up a space in the queue
//
Q.prototype._down = function(num) {
  this.workers--;
  this._next();
};


//
// ### Q#die()
// Kills the queue
//
Q.prototype.die = function() {
  this.workers = 0;
  this.num = 0;
  this.current = 0;
  this.queue = [];
  this.running = [];
  this.waiting = [];
}
