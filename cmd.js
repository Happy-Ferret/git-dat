#!/usr/bin/env node
var split = require('split2')
var through = require('through2')
var to = require('to2')
var combine = require('stream-combiner2')
var level = require('level')
var Dat = require('dat-js')
var fs = require('fs')
var path = require('path')

if (process.argv[2] === 'dat' && /^dat:/.test(process.argv[3])) {
  var link = new Buffer(process.argv[3].replace(/^dat:\/*/,''), 'hex')
  process.stdin.pipe(protocol(link)).pipe(process.stdout)
} else {
  console.error(process.argv)
}

function protocol (link) {
  var fetching = []
  return combine(split(), through(write))
  function write (buf, enc, next) {
    var line = buf.toString()
    console.error('line=', line)
    if (line === 'capabilities') {
      next(null, 'fetch\noption\npush\n\n')
    } else if (line === 'list') {
      open(link, function (err, dat) {
        if (err) return next(err)
        var s = dat.archive.list()
        s.pipe(to.obj(function (entry) {
          dat.archive.metadata.head(entry.block, function (err, r) {
            if (err) return next(err)
            var refs = [ r.toString('hex') + ' ' + 'refs/heads/master' ]
            next(null, refs.join('\n') + '\n\n')
          })
          s.destroy()
        }))
        dat.download()
      })
    } else if (/^option\b/.test(line)) {
      next(null, 'ok\n') // whatever
    } else if (/^fetch\b/.test(line)) {
      var parts = line.split(/\s+/)
      fetching.push({ hash: parts[1], ref: parts[2] })
      next()
    } else if (line === '' && fetching.length) {
      //dat.archive.metadata.get()
      //next(null, )
      fetching = []
    } else next()
  }
}

function open (link, cb) {
  gitdir(process.cwd(), function (err, gdir) {
    if (!gdir) return cb(new Error('git archive not found'))
    if (err) return cb(err)
    var datdir = path.resolve(gdir, '../.dat')
    var dat = Dat({ dir: datdir, key: link })
    dat.open(function () {
      cb(null, dat)
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
