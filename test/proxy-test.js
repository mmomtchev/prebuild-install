const test = require('tape')
const proxy = require('../proxy')

test('downloading using proxy', function (t) {
  t.plan(8)

  const opts = {
    proxy: 'https://user:pass@hostname.com:8080'
  }

  const reqOpts = {
    url: 'https://api.github.com/repos/mmomtchev/hadron-swig-napi-example-project/releases',
    json: true,
    headers: {
      'User-Agent': 'simple-get',
      Authorization: 'token TOKEN'
    }
  }

  const request = proxy(reqOpts, opts)

  t.equal(request.url, reqOpts.url, 'Request url remains the same')
  t.equal(request.json, reqOpts.json, 'Request json remains the same')
  t.equal(request.headers['User-Agent'], reqOpts.headers['User-Agent'], 'Request user agent remains the same')
  t.equal(request.Authorization, reqOpts.Authorization, 'Request auth remains the same')

  t.equal(request.agent.proxyOptions.host, 'hostname.com', 'Proxy hostname is set')
  t.equal(request.agent.proxyOptions.port, 8080, 'Proxy port is set')
  t.equal(request.agent.proxyOptions.proxyAuth, 'user:pass', 'Proxy auth is set')
  t.equal(request.agent.defaultPort, 443, 'Proxy default port is set')
})

test('downloading without using proxy', function (t) {
  t.plan(1)

  const reqOpts = {
    url: 'https://api.github.com/repos/mmomtchev/hadron-swig-napi-example-project/releases',
    json: true,
    headers: {
      'User-Agent': 'simple-get',
      Authorization: 'token TOKEN'
    }
  }

  const request = proxy(reqOpts, {})
  t.equal(request.agent, undefined, 'Proxy is not set')
})
