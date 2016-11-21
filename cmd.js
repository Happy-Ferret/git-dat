#!/usr/bin/env node
var split = require('split2')
var through = require('through2')
var to = require('to2')
var combine = require('stream-combiner2')
var level = require('level')
var Dat = require('dat-js')
var duplexify = require('duplexify')
var fs = require('fs')
var path = require('path')
var once = require('once')

var dat = null
if (process.argv[2] === 'dat' && /^dat:/.test(process.argv[3])) {
  var link = new Buffer(process.argv[3].replace(/^dat:\/*/,''), 'hex')
  process.stdin.pipe(handle(link)).pipe(process.stdout)
} else {
  console.error(process.argv)
}

function handle (link) {
  var d = duplexify()
  open(link, function (err, dat) {
    if (err) return exit(err)
    var s = protocol(dat)
    d.setReadable(s)
    d.setWritable(s)
    dat.download()
  })
  return d
}

function protocol (dat) {
  var fetching = null
  return combine(split(), through(write, end))
  function end () { dat.close() }

  function write (buf, enc, next) {
    next = once(next)
    var line = buf.toString()
    console.error('line=', line)
    if (line === 'capabilities') {
      next(null, 'fetch\noption\npush\n\n')
    } else if (line === 'list') {
      var s = dat.archive.list()
      var offset = 0
      s.pipe(to.obj(function (entry) {
        dat.archive.metadata.head(offset, function (err, r) {
          if (err) return next(err)
          var refs = [ r.toString('hex').slice(0,40)
            + ' ' + 'refs/heads/master' ]
          next(null, refs.join('\n') + '\n\n')
        })
        offset += entry.block
        s.destroy()
      }))
    } else if (/^option\b/.test(line)) {
      next(null, 'ok\n') // whatever
    } else if (/^fetch\b/.test(line)) {
      var parts = line.split(/\s+/)
      if (!fetching) fetching = {}
      fetching[parts[1]] = parts[2]
      next()
    } else if (line === '' && fetching) {
      var s = dat.archive.list({ live: false })
      s.pipe(to.obj(sWrite, sEnd))
      var refs = fetching
      var blocks = {}, offset = 0
      function sWrite (entry, enc, snext) {
        var o = offset
        offset += entry.blocks
        dat.archive.metadata.head(o, function (err, r) {
          if (err) return next(err)
          var hash = r.toString('hex').slice(0,40) // truncate to git's length
          if (refs[hash]) {
            entry.block = o
            blocks[hash] = entry
          }
          snext()
        })
      }
      function sEnd () {
        var pending = 1
        Object.keys(blocks).forEach(function (hash) {
          var entry = blocks[hash]
          dat.archive.createFileReadStream(entry)
            .pipe(fs.createWriteStream(entry.name))
            .once('finish', function () {
              if (--pending === 0) done()
            })
        })
        if (--pending === 0) done()
        function done () { next(null, '\n') }
      }
      fetching = null
    } else next()
  }
}

function open (link, cb) {
  if (dat) return cb(null, dat)
  gitdir(process.cwd(), function (err, gdir) {
    if (!gdir) return cb(new Error('git archive not found'))
    if (err) return cb(err)
    var datdir = path.resolve(gdir, '../.dat')
    var d = Dat({ dir: datdir, key: link })
    dat = d
    d.open(function (err) {
      if (err) cb(err)
      else cb(null, dat)
    })
  })
}

function gitdir (dir, cb) {
  var d = path.join(dir, '.git')
  fs.stat(d, function (err, stat) {
    if (stat) cb(null, d)
    else if (dir === '/') cb(null, null)
    else datdir(path.resolve(dir, '..'), cb)
  })
}

function exit (err) {
  console.error(err)
  process.exit(1)
}
