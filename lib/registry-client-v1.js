/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Docker Registry API v1 client. See the README for an intro.
 *
 * This covers the Docker "Registry API" and also relevant parts of the
 * "Index (or Hub) API".
 *
 * <https://docs.docker.com/reference/api/registry_api/>
 * <https://docs.docker.com/reference/api/docker-io_api/>
 * <https://docs.docker.com/reference/api/hub_registry_spec/>
 */

var assert = require('assert-plus');
var bunyan = require('bunyan');
var fmt = require('util').format;
var mod_url = require('url');
var restify = require('restify');
var tough = require('tough-cookie');
var vasync = require('vasync');
var VError = require('verror').VError;

var common = require('./common');


// --- Globals

var DEFAULT_REGISTRY_URL_V1 = 'https://registry-1.docker.io';



// --- internal support functions

/**
 * Special handling of errors from the registry server.
 *
 * When some of the endpoints get a 404, the response body is a largish dump
 * of test/html. We don't want to include that as an error "message". It
 * isn't useful.
 *
 * Usage:
 *      cb(new _sanitizeErr(err, req, res[, errmsg]));
 *
 * where `errmsg` is an optional fallback error message to use for the
 * sanitized 404 err.message.
 */
function _sanitizeErr(err, req, res, errmsg) {
    if (err.statusCode === 404 && res && res.headers['content-type'] &&
        res.headers['content-type'].split(';')[0] !== 'application/json')
    {
        err.message = errmsg || 'not found';
    }
    return err;
}



// --- RegistryClient

/**
 * Create a new Docker Registry V1 client for a particular repository.
 *
 * ...
 * @param opts.insecure {Boolean} Optional. Default false. Set to true
 *      to *not* fail on an invalid or self-signed server certificate.
 * ...
 *
 */
function RegistryClient(opts) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.name, 'opts.name');
    assert.optionalObject(opts.log, 'opts.log');
    assert.optionalString(opts.username, 'opts.username');
    assert.optionalString(opts.password, 'opts.password');
    assert.optionalBool(opts.standalone, 'opts.standalone');
    assert.optionalBool(opts.insecure, 'opts.insecure');
    assert.optionalString(opts.scheme, 'opts.scheme');
    // TODO: options to control the trust db for CA verification
    // TODO add passing through other restify options
    // Restify/Node HTTP client options.
    // opt.agent (optional, bool or object)
    assert.optionalString(opts.userAgent, 'opts.userAgent');
    assert.optionalObject(opts.proxy, 'opts.proxy');

    this.log = opts.log
        ? opts.log.child({
                component: 'registry',
                serializers: restify.bunyan.serializers
            })
        : bunyan.createLogger({
                name: 'registry',
                serializers: restify.bunyan.serializers
            });

    this.insecure = Boolean(opts.insecure);
    this.repo = common.parseRepo(opts.name);
    if (opts.scheme) {
        this.repo.index.scheme = opts.scheme;
    } else if (common.isLocalhost(this.repo.index.name)) {
        // Per docker.git:registry/config.go#NewServiceConfig we special
        // case localhost to allow HTTP. Note that this lib doesn't do
        // the "try HTTPS, then fallback to HTTP if allowed" thing that
        // docker-docker does, we'll just prefer HTTP for localhost.
        this.repo.index.scheme = 'http';
    }

    this._headers = {};
    if (opts.username && opts.password) {
        var buffer = new Buffer(opts.username + ':' + opts.password, 'utf8');
        this._headers.authorization = 'Basic ' + buffer.toString('base64');
    }
    this._cookieJar = new tough.CookieJar();

    /**
     * Determine if this registry is "standalone", i.e. if it does NOT use
     * Docker Hub for (token) auth.
     *
     * If we can't determine here, then it is discovered via the
     * 'X-Docker-Standalone' header is the ping response.
     * See `_ensureStandalone`.
     */
    if (opts.standalone !== undefined) {
        this.standalone = opts.standalone;
    } else if (this.repo.index.official) {
        this.standalone = false;
    }

    this._indexUrl = common.urlFromIndex(this.repo.index);
    this._registryUrl = this._getRegistryUrl();

    this._commonHttpClientOpts = {
        log: this.log,
        agent: opts.agent,
        proxy: opts.proxy,
        rejectUnauthorized: !this.insecure,
        userAgent: opts.userAgent || common.DEFAULT_USERAGENT
    };
    this._clientsToClose = [];

    Object.defineProperty(this, '_indexApi', {
        get: function () {
            if (self.__indexApi === undefined) {
                self.__indexApi = restify.createJsonClient(common.objMerge({
                    url: self._indexUrl
                }, self._commonHttpClientOpts));
                self._clientsToClose.push(self.__indexApi);
            }
            return this.__indexApi;
        }
    });
    Object.defineProperty(this, '_registryApi', {
        get: function () {
            if (self.__registryApi === undefined) {
                self.__registryApi = restify.createJsonClient(common.objMerge({
                    url: self._registryUrl
                }, self._commonHttpClientOpts));
                self._clientsToClose.push(self.__registryApi);
            }
            return this.__registryApi;
        }
    });
}


RegistryClient.prototype.close = function close() {
    for (var i = 0; i < this._clientsToClose.length; i++) {
        var client = this._clientsToClose[i];
        this.log.trace({host: client.url && client.url.host},
            'close http client');
        client.close();
    }
    this._clientsToClose = [];
};


RegistryClient.prototype._getRegistryUrl = function _getRegistryUrl() {
    if (this.repo.index.official) {  // v1
        return DEFAULT_REGISTRY_URL_V1;
    } else {
        return common.urlFromIndex(this.repo.index);
    }
};


RegistryClient.prototype._ensureStandalone = function _ensureStandalone(cb) {
    if (this.standalone !== undefined) {
        return cb();
    }
    // Ping has the side-effect of setting `this.standalone`.
    this.ping(cb);
};

/**
 * Get a registry session token from index.docker.io.
 *
 * Getting repo auth involves hitting the `listRepoImgs` endpoint
 * to get a 'X-Docker-Token' header. While the *body* of that
 * response is not the goal, it *can* provide useful information: some
 * more recent images include a checksum that can be useful for later
 * downloads, e.g. this extract for the busybox repo:
 *
 *      {
 *          "checksum": "tarsum+sha256:32abf29cb55c24e05ae534...117b0f44c98518",
 *          "id": "a943c4969b70574bb546a26bb28dc880...878f6e61be553de0aee1e61"
 *      },
 *
 * Currently we are throwing away that info. Registry API v2 might do away
 * with this double duty.
 *
 * Side-effects:
 * - `this.token` and `this._headers.Authorization` are set, if successful
 * - `this.endpoints` is set if the response headers include
 *   "X-Docker-Endpoints".
 */
RegistryClient.prototype._ensureToken = function _ensureToken(cb) {
    var self = this;
    if (this.standalone || this.token) {
        return cb();
    }

    this.log.trace('get session token');
    this.listRepoImgs(function (err, repoImgs, res) {
        if (err) {
            cb(err);
        } else {
            if (res.headers['x-docker-endpoints'] !== undefined) {
                var proto = mod_url.parse(self._indexApi.url).protocol;
                /* BEGIN JSSTYLED */
                // See session.go which appends the API version to the URL.
                this.endpoints = res.headers['x-docker-endpoints']
                    .split(/\s*,\s*/g)
                    .map(function (e) { return proto + '//' + e; });
                /* END JSSTYLED */
            }
            self.token = res.headers['x-docker-token'];
            self._headers = {
                Authorization: 'Token ' + self.token
            };
            cb();
        }
    });
};

/**
 * Convenience wrappers on RegistryClient._foo for use in `vasync.pipeline`.
 */
function ensureStandalone(regClient, cb) {
    regClient._ensureStandalone(cb);
}
function ensureToken(regClient, cb) {
    regClient._ensureToken(cb);
}
function pingCheck(regClient, cb) {
    regClient.ping(cb);
}


RegistryClient.prototype._saveCookies = function _saveCookies(url, res) {
    var header = res.headers['set-cookie'];
    if (!header) {
        return;
    }

    var cookie;
    if (Array.isArray(header)) {
        for (var i = 0; i < header.length; i++) {
            cookie = tough.Cookie.parse(header[i]);
            this._cookieJar.setCookieSync(cookie, url);
        }
    } else {
        cookie = tough.Cookie.parse(header[i]);
        this._cookieJar.setCookieSync(cookie, url);
    }
};


RegistryClient.prototype._getCookies = function _getCookies(url) {
    var cookies = this._cookieJar.getCookiesSync(url);
    if (cookies.length) {
        return cookies.join('; ');
    }
    return '';
};


/**
 * <https://docs.docker.com/reference/api/registry_api/#status>
 *
 * As a side-effect, `this.standalone` will be set (if not set already)
 * from the `X-Docker-Registry-Standalone: True|False` response header.
 */
RegistryClient.prototype.ping = function ping(cb) {
    var self = this;
    assert.func(cb, 'cb');

    this._indexApi.get({
        path: '/v1/_ping',
        headers: self._headers,
        // Ping should be fast. We don't want 15s of retrying.
        retry: false
    }, function _afterPing(err, req, res, obj) {
        if (err) {
            return cb(new VError(err, 'ping attempt to %s failed',
                self._indexUrl));
        }
        if (self.standalone === undefined) {
            if (self.repo.index.name === 'quay.io') {
                /*
                 * Quay.io responds with 'x-docker-registry-standalone: 0' but
                 * AFAICT doesn't seriously mean to use index.docker.io for
                 * Token auth.
                 *
                 * TODO: Could hardcode this earlier and avoid the ping.
                 */
                self.standalone = true;
                self.log.trace({standalone: self.standalone},
                    'set "standalone=true" for quay.io, ignoring header');
            } else {
                var header = res.headers['x-docker-registry-standalone'];
                switch (header.toLowerCase()) {
                case '1':
                case 'true':
                    self.standalone = true;
                    break;
                default:
                    self.standalone = false;
                    break;
                }
                self.log.trace({standalone: self.standalone},
                    'set "standalone" from ping response headers');
            }

        }
        return cb(null, obj, res);
    });
};


/**
 * https://docs.docker.com/reference/api/registry_api/#search
 */
RegistryClient.prototype.search = function search(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.term, 'opts.term');
    assert.func(cb, 'cb');

    // TODO Docker-docker sets `X-Docker-Token: true` a la `_ensureToken`
    //      handling above. This should do the same.
    var res, hits;
    vasync.pipeline({arg: this, funcs: [
        function call(_, next) {
            self._indexApi.get({
                path: '/v1/search',
                query: { q: opts.term },
                headers: self._headers
            }, function _afterSearch(err, req, res_, hits_) {
                if (err) {
                    return next(err);
                }
                res = res_;
                hits = hits_;
                next();
            });
        }
    ]}, function (err) {
        cb(err, hits, res);
    });
};


/**
 * List images in the given repository.
 *
 * Note: This same endpoint is typically used to get a index.docker.io
 * registry auth token and endpoint URL. See `_ensureToken` for details.
 */
RegistryClient.prototype.listRepoImgs = function listRepoImgs(cb) {
    var self = this;
    assert.func(cb, 'cb');

    this._indexApi.get({
        path: fmt('/v1/repositories/%s/images',
            encodeURI(this.repo.remoteName)),
        headers: common.objMerge({
            'X-Docker-Token': true
        }, this._headers)
    }, function _afterListRepoImgs(err, req, res, repoImgs) {
        if (err) {
            cb(_sanitizeErr(err, res, res,
                self.repo.localName + ' repo not found'));
        } else {
            cb(null, repoImgs, res);
        }
    });
};



/**
 * <https://docs.docker.com/reference/api/registry_api/#list-repository-tags>
 */
RegistryClient.prototype.listRepoTags = function listRepoTags(cb) {
    var self = this;
    assert.func(cb, 'cb');

    var res, repoTags;
    vasync.pipeline({arg: this, funcs: [
        ensureStandalone,
        ensureToken,
        function call(_, next) {
            self._registryApi.get({
                path: fmt('/v1/repositories/%s/tags',
                    encodeURI(self.repo.remoteName)),
                headers: self._headers
            }, function _afterCall(err, req, res_, repoTags_) {
                if (err) {
                    return next(err);
                }
                repoTags = repoTags_;
                res = res_;
                next();
            });
        }
    ]}, function (err) {
        cb(err, repoTags, res);
    });
};


/**
 * // JSSTYLED
 * <https://docs.docker.com/reference/api/registry_api/#get-image-id-for-a-particular-tag>
 */
RegistryClient.prototype.getImgId = function getImgId(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.tag, 'opts.tag');
    assert.func(cb, 'cb');

    var res, imgId;
    vasync.pipeline({arg: this, funcs: [
        ensureStandalone,
        ensureToken,
        function call(_, next) {
            self._registryApi.get({
                path: fmt('/v1/repositories/%s/tags/%s',
                    encodeURI(self.repo.remoteName),
                    encodeURIComponent(opts.tag)),
                headers: self._headers
            }, function _afterCall(err, req, res_, imgId_) {
                if (err) {
                    return next(err);
                }
                self._saveCookies(self._registryUrl + req.path, res_);
                imgId = imgId_;
                res = res_;
                next();
            });
        }
    ]}, function (err) {
        cb(err, imgId, res);
    });
};


/**
 * Gets the image's ancestry: all of the image layers that are required for
 * it to be functional.
 */
RegistryClient.prototype.getImgAncestry = function getImgAncestry(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.imgId, 'opts.imgId');
    assert.func(cb, 'cb');

    var res, ancestry;
    vasync.pipeline({arg: this, funcs: [
        ensureStandalone,
        ensureToken,
        function call(_, next) {
            var pth = fmt('/v1/images/%s/ancestry',
                    encodeURIComponent(opts.imgId));
            self._registryApi.get({
                path: pth,
                headers: common.objMerge({
                    cookie: self._getCookies(self._registryUrl + pth)
                }, self._headers)
            }, function _afterCall(err, req, res_, ancestry_) {
                if (err) {
                    return next(err);
                }
                ancestry = ancestry_;
                res = res_;
                next();
            });
        }
    ]}, function (err) {
        cb(err, ancestry, res);
    });
};


/**
 * Gets the image's JSON (i.e. its metadata).
 * Though a poor name, IMHO, docker.git/registry/session.go calls it the image
 * "JSON".
 */
RegistryClient.prototype.getImgJson = function getImgJson(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.imgId, 'opts.imgId');
    assert.func(cb, 'cb');

    var res, imgJson;
    vasync.pipeline({arg: this, funcs: [
        ensureStandalone,
        ensureToken,
        function call(_, next) {
            self._registryApi.get({
                path: fmt('/v1/images/%s/json',
                    encodeURIComponent(opts.imgId)),
                headers: self._headers
            }, function _afterCall(err, req, res_, imgJson_) {
                if (err) {
                    return next(err);
                }
                imgJson = imgJson_;
                res = res_;
                next();
            });
        }
    ]}, function (err) {
        cb(err, imgJson, res);
    });
};


/**
 * Get a *paused* readable stream to the given image's layer.
 *
 * Possible usage (skips error handling, see "examples/downloadImgLayer.js"):
 *
 *      client.getImgLayerStream({imgId: '...'}, function (err, stream) {
 *          var fout = fs.createWriteStream('/var/tmp/layer.file');
 *          fout.on('finish', function () {
 *              console.log('Done downloading image layer');
 *          });
 *          stream.pipe(fout);
 *          stream.resume();
 *      });
 *
 * @param opts {Object}
 *      - imgId {String}
 * @param cb {Function} `function (err, stream)`
 *      The `stream` is also an HTTP response object, i.e. headers are on
 *      `stream.headers`.
 */
RegistryClient.prototype.getImgLayerStream =
function getImgLayerStream(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.imgId, 'opts.imgId');
    assert.func(cb, 'cb');

    var nonRedirRes;

    vasync.pipeline({arg: this, funcs: [
        ensureStandalone,
        ensureToken,
        function call(_, next) {
            // We want a non-redirect (i.e. non-3xx) response to return. Use a
            // barrier to gate that.
            var barrier = vasync.barrier();
            barrier.on('drain', function _onGetNonRedirResult() {
                self.log.trace({res: nonRedirRes, imgId: opts.imgId},
                    'got a non-redir response');
                common.pauseStream(nonRedirRes); // party like it's node 0.10
                next(null, nonRedirRes);
            });

            var MAX_NUM_REDIRS = 3;
            var numRedirs = 0;
            function makeReq(reqOpts) {
                if (numRedirs >= MAX_NUM_REDIRS) {
                    next(new Error(fmt('maximum number of redirects (%s) hit ' +
                        'when attempt to get image layer stream for image %s',
                        MAX_NUM_REDIRS, opts.imgId)));
                    return;
                }
                numRedirs += 1;

                var client = restify.createHttpClient(common.objMerge({
                    url: reqOpts.url
                }, self._commonHttpClientOpts));
                self._clientsToClose.push(client);
                client.get(reqOpts, function _onConn(connErr, req) {
                    if (connErr) {
                        next(connErr);
                        return;
                    }
                    req.on('result', function (resultErr, res) {
                        if (resultErr) {
                            next(resultErr);
                            return;
                        }
                        if (res.statusCode === 302) {
                            var loc = mod_url.parse(res.headers.location);
                            makeReq({
                                url: loc.protocol + '//' + loc.host,
                                path: loc.path
                            });
                        } else {
                            nonRedirRes = res;
                            barrier.done('nonRedirRes');
                        }
                    });
                });
            }

            barrier.start('nonRedirRes');
            makeReq({
                url: self._getRegistryUrl(),
                path: fmt('/v1/images/%s/layer',
                    encodeURIComponent(opts.imgId)),
                headers: self._headers
            }, next);
        }
    ]}, function (err) {
        cb(err, nonRedirRes);
    });
};


// --- Exports

function createClient(opts) {
    return new RegistryClient(opts);
}

module.exports = {
    createClient: createClient
};
