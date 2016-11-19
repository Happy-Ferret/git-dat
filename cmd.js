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
  return combine(split(), through(write))

  function write (buf, enc, next) {
    var line = buf.toString()
    console.error('line=', line)
    if (line === 'capabilities') {
      next(null, 'fetch\noption\npush\n\n')
    } else if (line === 'list') {
      var s = dat.archive.list()
      s.pipe(to.obj(function (entry) {
        dat.archive.metadata.head(entry.block, function (err, r) {
          if (err) return next(err)
          var refs = [ r.toString('hex') + ' ' + 'refs/heads/master' ]
          next(null, refs.join('\n') + '\n\n')
        })
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
      var s = dat.archive.list()
      s.pipe(to.obj(function (entry, enc, snext) {
        console.error(entry)
        snext()
      }))
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
