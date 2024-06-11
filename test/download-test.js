const test = require('tape')
const fs = require('fs')
const rm = require('rimraf')
const path = require('path')
const http = require('http')
const https = require('https')
const download = require('../download')
const util = require('../util')
const error = require('../error')

const build = path.join(__dirname, 'lib')
const unpacked = path.join(build, 'binding', 'example.node')

test('downloading from GitHub, not cached', function (t) {
  t.plan(12)
  rm.sync(build)
  rm.sync(util.prebuildCache())

  const opts = getOpts()
  const downloadUrl = util.getDownloadUrl(opts)
  const cachedPrebuild = util.cachedPrebuild(downloadUrl)
  let tempFile

  let writeStreamCount = 0
  const _createWriteStream = fs.createWriteStream
  fs.createWriteStream = function (path) {
    if (writeStreamCount++ === 0) {
      tempFile = path
      t.ok(/\.tmp$/i.test(path), 'this is the temporary file')
    } else {
      t.ok(util.allowedPkgFiles.test(path), 'this is the unpacked file')
    }
    return _createWriteStream(path)
  }

  const _createReadStream = fs.createReadStream
  fs.createReadStream = function (path) {
    t.equal(path, cachedPrebuild, 'createReadStream called for cachedPrebuild')
    return _createReadStream(path)
  }

  const _request = https.request
  https.request = function (opts) {
    https.request = _request
    t.equal('https://' + opts.hostname + opts.path, downloadUrl, 'correct url')
    return _request.apply(https, arguments)
  }

  t.equal(fs.existsSync(build), false, 'no build folder')

  download(downloadUrl, opts, function (err) {
    t.error(err, 'no error')
    t.equal(fs.existsSync(util.prebuildCache()), true, 'prebuildCache created')
    t.equal(fs.existsSync(cachedPrebuild), true, 'prebuild was cached')
    t.equal(fs.existsSync(unpacked), true, unpacked + ' should exist')
    t.equal(fs.existsSync(tempFile), false, 'temp file should be gone')
    fs.createWriteStream = _createWriteStream
    fs.createReadStream = _createReadStream
  })
})

test('cached prebuild', function (t) {
  t.plan(7)
  rm.sync(build)

  const opts = getOpts()
  const downloadUrl = util.getDownloadUrl(opts)
  const cachedPrebuild = util.cachedPrebuild(downloadUrl)

  const _createWriteStream = fs.createWriteStream
  fs.createWriteStream = function (path) {
    t.ok(util.allowedPkgFiles.test(path), 'this is the unpacked file')
    return _createWriteStream(path)
  }

  const _createReadStream = fs.createReadStream
  fs.createReadStream = function (path) {
    t.equal(path, cachedPrebuild, 'createReadStream called for cachedPrebuild')
    return _createReadStream(path)
  }

  t.equal(fs.existsSync(build), false, 'no build folder')

  download(downloadUrl, opts, function (err) {
    t.error(err, 'no error')
    t.equal(fs.existsSync(unpacked), true, unpacked + ' should exist')
    fs.createReadStream = _createReadStream
    fs.createWriteStream = _createWriteStream
  })
})

test('local prebuild', function (t) {
  t.plan(8)
  rm.sync(build)

  const opts = getOpts()
  const downloadUrl = util.getDownloadUrl(opts)
  const cachedPrebuild = util.cachedPrebuild(downloadUrl)
  const localPrebuild = util.localPrebuild(downloadUrl, opts)

  t.ok(fs.existsSync(cachedPrebuild), 'cached prebuild exists')

  // fs.copyFileSync() not available before Node 8.5
  fs.writeFileSync(localPrebuild, fs.readFileSync(cachedPrebuild))

  const _createWriteStream = fs.createWriteStream
  fs.createWriteStream = function (path) {
    t.ok(util.allowedPkgFiles.test(path), 'this is the unpacked file')
    return _createWriteStream(path)
  }

  const _createReadStream = fs.createReadStream
  fs.createReadStream = function (path) {
    t.equal(path, localPrebuild, 'createReadStream called for localPrebuild')
    return _createReadStream(path)
  }

  t.equal(fs.existsSync(build), false, 'no build folder')

  download(downloadUrl, opts, function (err) {
    t.error(err, 'no error')
    t.equal(fs.existsSync(unpacked), true, unpacked + ' should exist')
    fs.createReadStream = _createReadStream
    fs.createWriteStream = _createWriteStream
    rm.sync(localPrebuild)
    rm.sync(build)
  })
})

test('non existing host should fail with no dangling temp file', function (t) {
  t.plan(3)

  const opts = getOpts()
  opts.pkg.binary = {
    host: 'https://foo.bar.baz'
  }

  const downloadUrl = util.getDownloadUrl(opts)
  const cachedPrebuild = util.cachedPrebuild(downloadUrl)

  const _createWriteStream = fs.createWriteStream
  fs.createWriteStream = function (path) {
    t.ok(false, 'no temporary file should be written')
    return _createWriteStream(path)
  }

  t.equal(fs.existsSync(cachedPrebuild), false, 'nothing cached')

  download(downloadUrl, opts, function (err) {
    t.ok(err, 'should error')
    t.equal(fs.existsSync(cachedPrebuild), false, 'nothing cached')
    fs.createWriteStream = _createWriteStream
  })
})

test('existing host but invalid url should fail', function (t) {
  t.plan(3)

  const opts = getOpts()
  opts.pkg.binary = {
    host: 'http://localhost:8888',
    remote_path: 'prebuilds',
    package_name: 'woohooo-{abi}'
  }
  opts.abi = process.versions.modules

  const downloadUrl = util.getDownloadUrl(opts)
  const cachedPrebuild = util.cachedPrebuild(downloadUrl)

  const server = http.createServer(function (req, res) {
    t.equal(req.url, '/prebuilds/woohooo-' + opts.abi, 'correct url')
    res.statusCode = 404
    res.end()
  }).listen(8888, function () {
    download(downloadUrl, opts, function (err) {
      t.same(err, error.noPrebuilts(opts))
      t.equal(fs.existsSync(cachedPrebuild), false, 'nothing cached')
      t.end()
      server.unref()
    })
  })
})

test('error during download should fail with no dangling temp file', function (t) {
  t.plan(7)

  const downloadError = new Error('something went wrong during download')

  const opts = getOpts()
  opts.pkg.binary = {
    host: 'http://localhost:8889',
    remote_path: 'prebuilds',
    package_name: 'woohooo-{abi}'
  }
  opts.abi = process.versions.modules

  const downloadUrl = util.getDownloadUrl(opts)
  const cachedPrebuild = util.cachedPrebuild(downloadUrl)
  let tempFile

  const _createWriteStream = fs.createWriteStream
  fs.createWriteStream = function (path) {
    tempFile = path
    t.ok(/\.tmp$/i.test(path), 'this is the temporary file')
    return _createWriteStream(path)
  }

  const _request = http.request
  http.request = function (opts) {
    http.request = _request
    t.equal('http://' + opts.hostname + ':' + opts.port + opts.path, downloadUrl, 'correct url')
    const wrapped = arguments[1]
    arguments[1] = function (res) {
      t.equal(res.statusCode, 200, 'correct statusCode')
      // simulates error during download
      setTimeout(function () { res.emit('error', downloadError) }, 10)
      wrapped(res)
    }
    return _request.apply(http, arguments)
  }

  const server = http.createServer(function (req, res) {
    t.equal(req.url, '/prebuilds/woohooo-' + opts.abi, 'correct url')
    res.statusCode = 200
    res.write('yep') // simulates hanging request
  }).listen(8889, function () {
    download(downloadUrl, opts, function (err) {
      t.equal(err.message, downloadError.message, 'correct error')
      t.equal(fs.existsSync(tempFile), false, 'no dangling temp file')
      t.equal(fs.existsSync(cachedPrebuild), false, 'nothing cached')
      t.end()
      fs.createWriteStream = _createWriteStream
      server.unref()
    })
  })
})

test('should fail if abi is system abi with invalid binary', function (t) {
  const opts = getOpts()
  opts.abi = process.versions.modules
  opts.pkg.binary = { host: 'http://localhost:8890' }
  opts.runtime = 'node'

  const server = http.createServer(function (req, res) {
    res.statusCode = 200
    const archive = path.join(__dirname, 'invalid.tar.gz')
    fs.createReadStream(archive).pipe(res)
  }).listen(8890, function () {
    download(util.getDownloadUrl(opts), opts, function (err) {
      server.unref()
      if (err && typeof err.message === 'string') {
        t.pass('require failed because of invalid abi')
      } else {
        t.fail('should have caused a require() error')
      }
      t.end()
    })
  })
})

function getOpts () {
  return {
    pkg: {
      name: 'hadron-swig-napi-example-project',
      version: '1.0.0',
      repository: {
        type: 'git',
        url: 'git+https://github.com/mmomtchev/hadron-swig-napi-example-project.git'
      },
      binary: {
        package_name: '{platform}-{arch}.tar.gz',
        remote_path: 'mmomtchev/hadron-swig-napi-example-project/releases/download/{tag_prefix}{version}/',
        host: 'https://github.com'
      }
    },
    runtime: 'napi',
    platform: process.platform,
    arch: process.arch,
    path: __dirname,
    'tag-prefix': 'v',
    'local-prebuilds': __dirname
  }
}
