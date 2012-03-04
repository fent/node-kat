var Q = require('../lib/queue')
  , assert = require('assert')


// shuffles an array
function shuffle(arr) {
  var i = this.length, j, tmp;
  if (i === 0) return;
  while (--i) {
    j = Math.floor(Math.random() * (i + 1));
    tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// calls pushed callbacks in random order once they are all pushed
function randomCall(c, list) {
  this.callbacks = [];
  this.c = c;
  this.list = list;
  this.n = 0;
}

randomCall.prototype.push = function(callback) {
  this.callbacks.push(callback);
  this.n++;
  if (this.n % this.c === 0 || this.n === this.list.length) {
    shuffle(this.callbacks);

    var cb;
    while (cb = this.callbacks.shift()) {
      cb();
    }
  }
}

// macro
function createQ(c, inject, amount) {
  var list = ['a', 'b', 'c'];
  var random1 = new randomCall(c, list);
  var random2 = new randomCall(c, list);

  return function(done) {
    var n = 0;
    var noin = true;
    var q = new Q(function(data, callback) {
      var num = this.num;

      random1.push(function() {
        // check for inject
        if (typeof inject === 'number' && inject === num && noin) {
          noin = false;
          amount = amount || 1;
          var arr = new Array(amount);
          for (var i = 0; i < amount; i++) {
            arr[i] = 'injected' + i;
          }

          list.splice.apply(list, [inject, 1].concat(arr));
          q.inject(arr, inject);

          return;
        }

        callback(function(callback) {
          assert.equal(data, list[n]);

          if (++n === list.length) done();
          random2.push(callback);
        });
      });
    }, c || 250);

    list.forEach(q.push.bind(q));


  }
}

describe('Queue jobs', function() {

  it('Calls methods in the order they were pushed', createQ());

  describe('with small concurrency', function() {
    it('Calls methods in correct order', createQ(2));
  });

  describe('with 1 concurrency', function() {
    it('Calls methods in correct order', createQ(1));
  });

  describe('and inject', function() {
    describe('one job', function() {

      describe('in the beginning', function() {
        it('Calls methods in correct order', createQ(200, 0));
      });

      describe('in the middle', function() {
        it('Calls methods in correct order', createQ(200, 1));
      });

      describe('in the end', function() {
        it('Calls methods in correct order', createQ(200, 2));
      });

    });

    describe('several jobs', function() {

      describe('in the beginning', function() {
        it('Calls methods in correct order', createQ(200, 0, 3));
      });

      describe('in the middle', function() {
        it('Calls methods in correct order', createQ(200, 1, 3));
      });

      describe('in the end', function() {
        it('Calls methods in correct order', createQ(200, 2, 3));
      });

    });
  });
});
