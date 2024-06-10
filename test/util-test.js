const test = require('tape')
const fs = require('fs')
const home = require('os').homedir
const util = require('../util')
const path = require('path')

test('prebuildCache() for different environments', function (t) {
  const NPMCACHE = process.env.npm_config_cache
  delete process.env.npm_config_cache
  const APPDATA = process.env.APPDATA = 'somepathhere'
  t.equal(util.prebuildCache(), path.join(APPDATA, '/npm-cache/_prebuilds'), 'APPDATA set')
  delete process.env.APPDATA
  t.equal(util.prebuildCache(), path.join(home(), '/.npm/_prebuilds'), 'APPDATA not set')
  process.env.npm_config_cache = NPMCACHE
  t.equal(util.prebuildCache(), path.join(NPMCACHE, '/_prebuilds'), 'npm_config_cache set')
  t.end()
})

test('cachedPrebuild() converts url to valid characters', function (t) {
  const url = 'https://github.com/level/leveldown/releases/download/v1.4.0/leveldown-v1.4.0-node-v14-linux-x64.tar.gz'
  const tail = 'https-github.com-level-leveldown-releases-download-v1.4.0-leveldown-v1.4.0-node-v14-linux-x64.tar.gz'
  const cached = util.cachedPrebuild(url)
  t.ok(cached.indexOf(tail))
  t.end()
})

test('tempFile() ends with pid and random number', function (t) {
  const url = 'https://github.com/level/leveldown/releases/download/v1.4.0/leveldown-v1.4.0-node-v14-linux-x64.tar.gz'
  const cached = util.cachedPrebuild(url)
  const tempFile = util.tempFile(cached)
  const regexp = /(\S+)\.(\d+)-([a-f0-9]+)\.tmp$/gi
  const match = regexp.exec(tempFile)
  t.ok(match, 'matches')
  t.equal(match[1], cached, 'starts with cached file name')
  fs.access(tempFile, fs.R_OK | fs.W_OK, function (err) {
    t.ok(err && err.code === 'ENOENT', 'file should not exist yet')
    t.end()
  })
})

test('urlTemplate() returns different templates based on pkg and rc', function (t) {
  const o1 = { download: 'd0000d' }
  const t1 = util.urlTemplate(o1)
  t.equal(t1, 'd0000d', 'template based on --download <string>')
  const o2 = {
    pkg: { binary: { host: 'http://foo.com' } }
  }
  const t2 = util.urlTemplate(o2)
  t.equal(t2, 'http://foo.com/{name}-v{version}-{runtime}-v{abi}-{platform}{libc}-{arch}.tar.gz', 'template based on pkg.binary properties')
  const o3 = {
    pkg: { binary: { host: 'http://foo.com' } },
    download: true
  }
  const t3 = util.urlTemplate(o3)
  t.equal(t3, t2, 'pkg: {} takes precedence over --download')
  const o4 = {
    pkg: { binary: { host: 'http://foo.com' } },
    download: 'd0000d'
  }
  const t4 = util.urlTemplate(o4)
  t.equal(t4, t1, '--download <string> always goes first')
  const o5 = {
    pkg: { binary: { host: 'http://foo.com', remote_path: 'w00t' } }
  }
  const t5 = util.urlTemplate(o5)
  t.equal(t5, 'http://foo.com/w00t/{name}-v{version}-{runtime}-v{abi}-{platform}{libc}-{arch}.tar.gz', 'pkg.binary.remote_path is added after host, default format')
  const o6 = {
    pkg: {
      binary: {
        host: 'http://foo.com',
        remote_path: 'w00t',
        package_name: '{name}-{major}.{minor}-{runtime}-v{abi}-{platform}-{arch}.tar.gz'
      }
    }
  }
  const t6 = util.urlTemplate(o6)
  t.equal(t6, 'http://foo.com/w00t/{name}-{major}.{minor}-{runtime}-v{abi}-{platform}-{arch}.tar.gz', 'pkg.binary.package_name is added after host and remote_path, custom format')
  const o7 = {
    pkg: require('../package.json'),
    download: true
  }
  delete o7.binary
  let envProperty = 'npm_config_' + o7.pkg.name.replace(util.npmInvalidCharsRE, '_') + '_binary_host'
  process.env[envProperty] = 'http://overriden-url.com/overriden-path'
  const t7 = util.urlTemplate(o7)
  delete process.env[envProperty]
  t.equal(t7, 'http://overriden-url.com/overriden-path/{tag_prefix}{version}/{name}-v{version}-{runtime}-v{abi}-{platform}{libc}-{arch}.tar.gz', '--download with host mirror override')
  const o8 = {
    pkg: Object.assign({}, require('../package.json'), {
      binary: {
        host: 'http://foo.com',
        remote_path: 'w00t',
        package_name: '{name}-{major}.{minor}-{runtime}-v{abi}-{platform}-{arch}.tar.gz'
      }
    }),
    download: true
  }
  envProperty += '_mirror'
  process.env[envProperty] = 'http://overriden-url.com/overriden-path'
  const t8 = util.urlTemplate(o8)
  delete process.env[envProperty]
  t.equal(t8, 'http://overriden-url.com/overriden-path/{tag_prefix}{version}/{name}-v{version}-{runtime}-v{abi}-{platform}{libc}-{arch}.tar.gz', '--download with binary defined and host mirror override')
  const o9 = { pkg: require('../package.json'), download: true }
  const t9 = util.urlTemplate(o9)
  t.equal(t9, 'https://github.com/mmomtchev/prebuild-install/releases/download/{tag_prefix}{version}/{name}-v{version}-{runtime}-v{abi}-{platform}{libc}-{arch}.tar.gz', '--download with no arguments, no pkg.binary, no host mirror, default format')
  t.end()
})

test('urlTemplate() with pkg.binary cleans up leading ./ or / and trailing /', function (t) {
  const expected = 'http://foo.com/w00t/{name}-{major}.{minor}-{runtime}-v{abi}-{platform}-{arch}.tar.gz'
  const o = {
    pkg: {
      binary: {
        host: 'http://foo.com/',
        remote_path: '/w00t',
        package_name: '/{name}-{major}.{minor}-{runtime}-v{abi}-{platform}-{arch}.tar.gz'
      }
    }
  }
  t.equal(util.urlTemplate(o), expected)
  o.pkg.binary = {
    host: 'http://foo.com/',
    remote_path: './w00t/',
    package_name: './{name}-{major}.{minor}-{runtime}-v{abi}-{platform}-{arch}.tar.gz'
  }
  t.equal(util.urlTemplate(o), expected)
  o.pkg.binary = {
    host: 'http://foo.com/',
    remote_path: 'w00t/',
    package_name: '{name}-{major}.{minor}-{runtime}-v{abi}-{platform}-{arch}.tar.gz/'
  }
  t.equal(util.urlTemplate(o), expected)
  o.pkg.binary = {
    host: 'http://foo.com',
    remote_path: './w00t',
    package_name: '/{name}-{major}.{minor}-{runtime}-v{abi}-{platform}-{arch}.tar.gz/'
  }
  t.equal(util.urlTemplate(o), expected)
  t.end()
})

test('getDownloadUrl() expands template to correct values', function (t) {
  const abi = process.versions.modules
  const o1 = {
    pkg: {
      name: 'a-native-module',
      version: 'x.y.z-alpha5',
      binary: {
        host: 'https://foo.com',
        module_name: 'a-native-module-bindings',
        package_name: '{name}-{package_name}-{version}-{major}-{minor}-{patch}-{prerelease}-{abi}-{node_abi}-{platform}-{arch}-{configuration}-{module_name}'
      }
    },
    platform: 'coolplatform',
    arch: 'futureplatform'
  }
  const url1 = util.getDownloadUrl(o1)
  t.equal(url1, 'https://foo.com/a-native-module-a-native-module-x.y.z-alpha5-x-y-z-alpha5-alpha5-' + abi + '-' + abi + '-coolplatform-futureplatform-Release-a-native-module-bindings', 'weird url but testing everything is propagated, with prerelease and Release')
  const o2 = {
    pkg: {
      name: 'a-native-module',
      version: 'x.y.z+beta77',
      binary: {
        host: 'https://foo.com',
        module_name: 'a-native-module-bindings',
        package_name: '{name}-{package_name}-{version}-{major}-{minor}-{patch}-{build}-{abi}-{node_abi}-{platform}-{arch}-{configuration}-{module_name}'
      }
    },
    platform: 'coolplatform',
    arch: 'futureplatform',
    debug: true
  }
  const url2 = util.getDownloadUrl(o2)
  t.equal(url2, 'https://foo.com/a-native-module-a-native-module-x.y.z+beta77-x-y-z+beta77-beta77-' + abi + '-' + abi + '-coolplatform-futureplatform-Debug-a-native-module-bindings', 'weird url but testing everything is propagated, with build and Debug')
  const o3 = {
    pkg: {
      name: '@scope/a-native-module',
      version: 'x.y.z+beta77',
      binary: {
        host: 'https://foo.com',
        module_name: 'a-native-module-bindings',
        package_name: '{name}-{package_name}-{version}-{major}-{minor}-{patch}-{build}-{abi}-{node_abi}-{platform}-{arch}-{configuration}-{module_name}'
      }
    },
    platform: 'coolplatform',
    arch: 'futureplatform',
    debug: true
  }
  const url3 = util.getDownloadUrl(o3)
  t.equal(url3, url2, 'scope does not matter for download url')
  const o4 = {
    pkg: {
      name: '@scope-with.special~chars_/a-native-module',
      version: 'x.y.z+beta77',
      binary: {
        host: 'https://foo.com',
        module_name: 'a-native-module-bindings',
        package_name: '{name}-{package_name}-{version}-{major}-{minor}-{patch}-{build}-{abi}-{node_abi}-{platform}-{arch}-{configuration}-{module_name}'
      }
    },
    platform: 'coolplatform',
    arch: 'futureplatform',
    debug: true
  }
  const url4 = util.getDownloadUrl(o4)
  t.equal(url4, url2, 'scope with special characters does not matter for download url')
  t.end()
})

test('localPrebuild', function (t) {
  const envProp = 'npm_config_a_native_module_local_prebuilds'
  const basename = 'a-native-module-v1.4.0-node-v14-linux-x64.tar.gz'
  const url = 'https://github.com/a-native-module/a-native-module/releases/download/v1.4.0/' + basename
  const o1 = {
    pkg: {
      name: 'a-native-module'
    }
  }
  const path1 = util.localPrebuild(url, o1)
  t.equal(path1, path.join('prebuilds', basename))
  const o2 = {
    pkg: {
      name: 'a-native-module'
    },
    'local-prebuilds': path.join('', 'path', 'to', 'prebuilds')
  }
  const path2 = util.localPrebuild(url, o2)
  t.equal(path2, path.join(o2['local-prebuilds'], basename), 'opts overrides default')
  const envPrefix = path.join('', 'overriden', 'path', 'to', 'prebuilds')
  process.env[envProp] = envPrefix
  const path3 = util.localPrebuild(url, o2)
  t.equal(path3, path.join(envPrefix, basename), 'env overrides opts')
  t.end()
})
