const url = require('url')
const tunnel = require('tunnel-agent')
const util = require('./util')

function applyProxy (reqOpts, opts) {
  const log = opts.log || util.noopLogger

  const proxy = opts['https-proxy'] || opts.proxy

  if (proxy) {
    const parsedDownloadUrl = new url.URL(reqOpts.url)
    const parsedProxy = new url.URL(proxy)
    const uriProtocol = (parsedDownloadUrl.protocol === 'https:' ? 'https' : 'http')
    const proxyProtocol = (parsedProxy.protocol === 'https:' ? 'Https' : 'Http')
    const tunnelFnName = [uriProtocol, proxyProtocol].join('Over')
    reqOpts.agent = tunnel[tunnelFnName]({
      proxy: {
        host: parsedProxy.hostname,
        port: +parsedProxy.port,
        proxyAuth: parsedProxy.username
          ? `${parsedProxy.username}:${parsedProxy.password}`
          : undefined
      }
    })
    log.http('request', 'Proxy setup detected (Host: ' +
    parsedProxy.hostname + ', Port: ' +
      parsedProxy.port + ', Authentication: ' +
      (parsedProxy.auth ? 'Yes' : 'No') + ')' +
      ' Tunneling with ' + tunnelFnName)
  }

  return reqOpts
}

module.exports = applyProxy
