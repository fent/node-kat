# node-kat

A simple module that concatenates files and binary streams with some extras.

[![Build Status](https://secure.travis-ci.org/fent/node-kat.svg)](http://travis-ci.org/fent/node-kat)
[![Dependency Status](https://david-dm.org/fent/node-kat.svg)](https://david-dm.org/fent/node-kat)
[![codecov](https://codecov.io/gh/fent/node-kat/branch/master/graph/badge.svg)](https://codecov.io/gh/fent/node-kat) [![Greenkeeper badge](https://badges.greenkeeper.io/fent/node-kat.svg)](https://greenkeeper.io/)

# Usage

```js
const Kat = require('kat');
const readstream = new Kat();

readstream.add('file1.txt');
readstream.add('file2.txt');
readstream.add(anotherReadableStream);

readstream.pipe(fs.createWriteStream('file1n2.txt'));
```
`readstream` will emit `data`, `err` and `end` events like a regular readstream should. `pause()` and `resume()` can also be called on it.

# When you should use this
You might be thinking this module is way too simple to even be a module. I was thinking the same thing until I thought about how this type of module should really work.

There are several node modules where their API allow developers to pass in file data by passing in a file path to a method.

```js
foo.read('myfile.json', (err, result) => {
  // Do something with result.
});
```

These modules are doing it wrong. (With the exception of modules that are used during setup)

In many cases, you will want to have the option to pass in a readable stream of the file. Why? Because with a stream, not only can you give it a local file stream, but it can also be a stream from a remote request. Or even a stream that parses or uncompresses another stream.

```js
// Local file.
const fs = require('fs');
foo.read(fs.createReadStream('myfile.json'));

// Remote file.
// Request conveniently returns a readable stream.
const request = require('request');
foo.read(request('http://somewhere.net/over/the/rainbow.json'));

// Compressed file.
const fs = require('fs');
const zlib = require('zlib');
var stream = fs.createReadStream('myfile.json').pipe(zlib.createDeflate());
foo.read(stream);
```

The module could even be used in a server that allows file uploads without the server having to save the entire file to disc.

```js
require('http').createServer((req, res) => {
  foo.read(req, (err, result) => {
    // Respond to res.
  });
});
```

But ideally, we want to make our module APIs as convenient as possible for other developers. It's really common for a module to receive streams that are local file read streams made with `fs.createReadStream`. Thus it would be convenient to allow its users to give the module a file path OR a readable stream.

```js
// Pass in a file path.
foo.read('myfile.json');

// Pass in a stream.
foo.read(fs.createReadStream('myfile.json'));
```

But what if your module is the type that allows its users to add multiple files to it?

```js
var bar = foo.createBar();
bar.add('file1.json');
bar.add('file2.json');
```

This is where node-kat shines. It easily allows you to convenielize (yes convenielize) your API by allowing users to input file paths, readable streams, and even paths to directories.

```js
var bar = foo.createBar();
var request = require('request');
bar.add('file1.json');
bar.add(request('file2.json');
bar.add('a/local/dir');
```

Now the bar instance will get all the data from the files it needs, in order, and aware of what file or stream it's coming from.


# API
### new Kat([file1...], [options])
Creates a new instance of Kat. Passing in files to the constructor is a shortcut to the `Kat#add()` method. Last argument will be considered options object if not a string or a stream. Options defaults to

```js
// will be used whenever a file is opened
{ flags: 'r',
  encoding: null,
  mode: 438,

// can be used to select what part of the concatenated file will be read
// even if that means skipping files entirely
  start: 0,
  end: Infinity,

// if true, will keep reading any additional streams if there is an error
// if false, will stop and destroy all streams as soon as there is one error
  continueOnErr: false,

  allowFiles: true,
  allowDirs: true,
  allowStreams: true,
  concurrency: 250,

// if true, will emit `end` when it finishes reading all streams
  autoEnd: true,
}
```

### Kat#add(file...)
Adds argument list to the list of files that will be concatenated. `file` can be a string to a path of a file, a folder, or a readable stream. If it's a folder, all files in it will be recursively added alphabetically.

### Kat#destroy()
Stops the stream and destroys all underlying file stream.

# Events

### Event: 'open'
* `number` - File descriptor.
* `string` - File path.

When a file descriptor is opened, this will be emitted. In case a non-file readable stream is added, `filepath` will be the item index relative to all other items in the list.

### Event: 'close'
* `string` - File path.

Emitted when a file descriptor is closed.

### Event: 'start'
* `string` - File path.

Emitted when the Kat instance starts reading from a stream.

### Event: 'end'

Emitted when all streams have been read.

### Event: 'files'
* `Array.Object` - Will be an array of objects containing a `path` and `size` key.

Emitted right before the `end` event.

```js
[
  { path: "/home/user/files/somefile.txt", size: 324 },
  { path: 1, size: 4459 }
]
```

### Event: 'error'
* `Error`

When there is an error opening a file, reading from it, or with a stream.


# Install

    npm install kat


# Tests
Tests are written with [mocha](https://mochajs.org)

```bash
npm test
```
