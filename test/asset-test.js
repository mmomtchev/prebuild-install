const test = require('tape')
const fs = require('fs')
const rm = require('rimraf')
const path = require('path')
const https = require('https')
const download = require('../download')
const util = require('../util')
const asset = require('../asset')
const nock = require('nock')
const releases = require('./releases.json')

const build = path.join(__dirname, 'lib')
const unpacked = path.join(build, 'binding', 'example.node')

// Release assets call
nock('https://api.github.com:443', {
  encodedQueryParams: true,
  reqheaders: {
    'User-Agent': 'simple-get',
    Authorization: 'token TOKEN'
  }
})
  .persist()
  .get('/repos/mmomtchev/hadron-swig-napi-example-project/releases')
  .reply(200, releases)

// Binary download
nock('https://api.github.com:443', {
  encodedQueryParams: true,
  reqheaders: {
    'User-Agent': 'simple-get'
  }
})
  .persist()
  .get(function (uri) {
    return /\/repos\/mmomtchev\/hadron-swig-napi-example-project\/releases\/assets\/\d*/g.test(uri)
  })
  .reply(302, undefined, {
    Location: function (req, res, body) {
      const assetId = req.path
        .replace('/repos/mmomtchev/hadron-swig-napi-example-project/releases/assets/', '')

      for (const release of releases) {
        for (const asset of release.assets) {
          if (asset.id.toString() === assetId) {
            return asset.browser_download_url
          }
        }
      }
    }
  })

test('downloading from GitHub with token', function (t) {
  t.plan(13)
  rm.sync(build)
  rm.sync(util.prebuildCache())

  const opts = getOpts()
  asset(opts, function (err, assetId) {
    t.error(err, 'no error')

    const downloadUrl = util.getAssetUrl(opts, assetId)
    const cachedPrebuild = util.cachedPrebuild(downloadUrl)
    let tempFile

    let writeStreamCount = 0
    const _createWriteStream = fs.createWriteStream
    fs.createWriteStream = function (path) {
      if (writeStreamCount++ === 0) {
        tempFile = path
        t.ok(/\.tmp$/i.test(path), 'this is the temporary file')
      } else {
        t.ok(/(.node)|(.d.ts)|(.cjs)|(.mjs)|(.wasm)$/i.test(path), 'this is the unpacked file')
      }
      return _createWriteStream(path)
    }

    const _createReadStream = fs.createReadStream
    fs.createReadStream = function (path) {
      t.equal(path, cachedPrebuild, 'createReadStream called for cachedPrebuild')
      return _createReadStream(path)
    }

    const _request = https.request
    https.request = function (req) {
      https.request = _request
      t.equal('https://' + req.hostname + req.path, downloadUrl, 'correct url')
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
})

test('non existing version should fail asset request', function (t) {
  t.plan(3)
  rm.sync(build)
  rm.sync(util.prebuildCache())

  const opts = getOpts()
  opts.pkg = Object.assign({}, opts.pkg, { version: '0' })
  asset(opts, function (err, assetId) {
    t.ok(err, 'should error')
    t.equal(assetId, undefined)

    const downloadUrl = util.getAssetUrl(opts, assetId)
    const cachedPrebuild = util.cachedPrebuild(downloadUrl)

    t.equal(fs.existsSync(cachedPrebuild), false, 'nothing cached')
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
    token: 'TOKEN',
    'tag-prefix': 'v'
  }
}
