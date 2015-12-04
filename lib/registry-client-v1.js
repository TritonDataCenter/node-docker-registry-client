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
 * <https://docs.docker.com/v1.6/reference/api/registry_api/>
 * <https://docs.docker.com/v1.7/reference/api/docker-io_api/>
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
var errors = require('./errors');


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


// --- special v1-related, but not RegistryClientV1-tied functionality

/**
 * Ping a given Docker *index* URL (as opposed to a registry that requires
 * a repo name).
 */
function pingIndex(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.indexName, 'opts.indexName');
    assert.optionalBool(opts.insecure, 'opts.insecure');
    assert.optionalObject(opts.log, 'opts.log');
    assert.optionalString(opts.userAgent, 'opts.userAgent');
    assert.func(cb, 'cb');

    var index = common.parseIndex(opts.indexName);
    var client = restify.createJsonClient({
        url: common.urlFromIndex(index),
        log: opts.log,
        userAgent: opts.userAgent || common.DEFAULT_USERAGENT,
        rejectUnauthorized: !opts.insecure
    });

    client.get({
        path: '/v1/_ping'
    }, function _afterPing(err, req, res, obj) {
        client.close();
        if (err) {
            return cb(err);
        }
        return cb(null, obj, res);
    });
}


/**
 * Login V1
 *
 * This attempts to reproduce the logic of "docker.git:registry/auth.go#loginV1"
 *
 * @param opts {Object}
 * @param opts.indexName {String} Either an indexName that `parseIndex`
 *      will handle, or an index URL (e.g. the default from `docker login` is
 *      'https://index.docker.io/v1/').
 * ...
 * @param cb {Function} `function (err, result)`
 *      On success, `result` is an object with:
 *          status      a string description of the login result status
 */
function login(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.indexName, 'opts.indexName');
    assert.string(opts.username, 'opts.username');
    assert.string(opts.email, 'opts.email');
    assert.string(opts.password, 'opts.password');
    assert.optionalBool(opts.insecure, 'opts.insecure');
    assert.optionalObject(opts.log, 'opts.log');
    assert.optionalString(opts.userAgent, 'opts.userAgent');
    assert.func(cb, 'cb');

    // `docker login` with no args passes
    // `serveraddress=https://index.docker.io/v1/`. Let's not blow up on that.
    var indexUrl, indexOfficial;
    try {
        var index = common.parseIndex(opts.indexName);
        indexUrl = common.urlFromIndex(index);
        indexOfficial = index.official;
    } catch (parseErr) {
        indexUrl = opts.indexName;
        indexOfficial = (indexUrl === 'https://index.docker.io/v1/');
    }

    var client = restify.createJsonClient({
        url: indexUrl,
        log: opts.log,
        retry: false, // Fail fast. We don't want 15s of retrying.
        userAgent: opts.userAgent || common.DEFAULT_USERAGENT,
        agent: opts.agent,
        proxy: opts.proxy,
        headers: opts.headers,
        rejectUnauthorized: !opts.insecure
    });
    var status;

    vasync.pipeline({arg: {}, funcs: [
        /*
         * This *can* create a user (e.g. on Docker Hub). Typically though the
         * statusCode is used to determine next steps.
         */
        function createUser(ctx, next) {
            client.post({
                path: '/v1/users/'
            }, {
                username: opts.username,
                email: opts.email,
                password: opts.password
            }, function _afterCreateUser(err, req, res, body) {
                if (err && !res) {  // e.g. connect error
                    return next(err);
                }
                ctx.createStatusCode = res.statusCode;
                ctx.createErr = err;
                ctx.createBody = body;
                next();
            });
        },

        function handle201(ctx, next) {
            if (ctx.createStatusCode !== 201) {
                return next();
            }
            if (indexOfficial) {
                status = 'Account created. Please use the confirmation ' +
                    'link we sent to your e-mail to activate it.';
            } else {
                status = 'Account created. Please see the documentation ' +
                    'of the registry ' + opts.indexName +
                    ' for instructions how to activate it.';
            }
            next(true);
        },

        function handle400(ctx, next) {
            if (ctx.createStatusCode !== 400) {
                return next();
            }
            if (ctx.createBody !== 'Username or email already exists') {
                return next(new Error(fmt('Registration: %j', ctx.createBody)));
            }

            client.basicAuth(opts.username, opts.password);
            client.get({
                path: '/v1/users/'
            }, function (err, req, res, body) {
                if (res.statusCode === 200) {
                    status = 'Login Succeeded';
                    next(true);
                } else if (res.statusCode === 401) {
                    next(new Error('Wrong login/password, please try again'));
                } else if (res.statusCode === 403) {
                    if (indexOfficial) {
                        next(new Error('Login: Account is not Active. ' +
                            'Please check your e-mail for a confirmation ' +
                            'link.'));
                    } else {
                        next(new Error('Login: Account is not Active. ' +
                            'Please see the documentation of the registry ' +
                            opts.indexName + ' for instructions how to ' +
                            'activate it.'));
                    }
                } else {
                    next(new Error(fmt('Login: %s (Code: %d; Headers: %j)',
                        body, res.statusCode, res.headers)));
                }
            });
        },

        function handle401(ctx, next) {
            if (ctx.createStatusCode !== 401) {
                return next();
            }

            client.basicAuth(opts.username, opts.password);
            client.get({
                path: '/v1/users/'
            }, function (err, req, res, body) {
                if (res.statusCode === 200) {
                    status = 'Login Succeeded';
                    next(true);
                } else if (res.statusCode === 401) {
                    next(new Error('Wrong login/password, please try again'));
                } else {
                    next(new Error(fmt('Login: %s (Code: %d; Headers: %j)',
                        body, res.statusCode, res.headers)));
                }
            });
        },

        function handleOther(ctx, next) {
            var msg = fmt('Unexpected status code [%d] : %s',
                ctx.createStatusCode, ctx.createBody);
            if (ctx.createErr) {
                next(new VError(ctx.createErr, msg));
            } else {
                next(new Error(msg));
            }
        }

    ]}, function (err) {
        if (err === true) { // Signal for early abort.
            err = null;
        }
        client.close();
        if (err) {
            cb(err);
        } else {
            cb(null, {status: status});
        }
    });
}



// --- RegistryClientV1

/**
 * Create a new Docker Registry V1 client for a particular repository.
 *
 * ...
 * @param opts.insecure {Boolean} Optional. Default false. Set to true
 *      to *not* fail on an invalid or self-signed server certificate.
 * ...
 *
 */
function RegistryClientV1(opts) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.name, 'opts.name');
    assert.optionalObject(opts.log, 'opts.log');
    assert.optionalString(opts.username, 'opts.username');
    assert.optionalString(opts.password, 'opts.password');
    assert.optionalBool(opts.insecure, 'opts.insecure');
    assert.optionalString(opts.scheme, 'opts.scheme');
    // TODO: options to control the trust db for CA verification
    // TODO add passing through other restify options
    // Restify/Node HTTP client options.
    // opt.agent (optional, bool or object)
    assert.optionalString(opts.userAgent, 'opts.userAgent');
    // opts.proxy (optional, bool or object or string);

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

    if (opts.username && opts.password) {
        var buffer = new Buffer(opts.username + ':' + opts.password, 'utf8');
        this._authorization = 'Basic ' + buffer.toString('base64');
    }
    this._ensuredSession = false;
    this._cookieJar = new tough.CookieJar();

    this._indexUrl = common.urlFromIndex(this.repo.index);
    this._registryUrl = this._getRegistryUrl();
    this._registryHost = mod_url.parse(this._registryUrl).host;

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

RegistryClientV1.prototype.version = 1;


RegistryClientV1.prototype.close = function close() {
    for (var i = 0; i < this._clientsToClose.length; i++) {
        var client = this._clientsToClose[i];
        this.log.trace({host: client.url && client.url.host},
            'close http client');
        client.close();
    }
    this._clientsToClose = [];
};


RegistryClientV1.prototype._getRegistryUrl = function _getRegistryUrl() {
    if (this.repo.index.official) {  // v1
        return DEFAULT_REGISTRY_URL_V1;
    } else {
        return common.urlFromIndex(this.repo.index);
    }
};


/**
 * Get a repository session token or cookie, if necessary.
 *
 * Getting access to a particular repository *often* requires a session token
 * or cookie. In all cases I know of, this is retrieved via the "List repository
 * images" endpoint of the "Index API" (aka "Docker Hub API").
 * //JSSTYLED
 * <https://docs.docker.com/v1.7/reference/api/docker-io_api/#list-user-repository-images>
 * //JSSTYLED
 * <https://docs.docker.com/v1.7/reference/api/docker-io_api/#list-library-repository-images>
 *
 * However the details of *how* vary.
 *
 * - Docker Hub (aka docker.io) uses tokens. This is retrieved via
 *   "GET /v1/repositories/$repo/images" with "X-Docker-Token: true"
 *   request header.
 *   Note: Usage of this endpoint is a little unfortunate because the response
 *   body can be of not insignificant size, which is a little wasteful.
 *
 * - Other v1 Docker registry APIs are meant to indicate that they don't use
 *   tokens from index.docker.io by including
 *          X-Docker-Registry-Standalone: True|False
 *   as a response header to the ping endpoint.
 *   *However*, the quay.io responds with `X-Docker-Registry-Standalone: 0`
 *   which (a) isn't `True|False` and (b) is just wrong -- it *is* standalone.
 *   It is possible that earlier versions of the `docker` client required this
 *   header value to trigger calling retrieval of the session cookie.
 *
 * - For standalone registry APIs, some don't require a session. For example
 *   a stock "docker run registry:0.9.1" (the latest pre-v2 Docker registry
 *   image), *will* return "X-Docker-Token" response headers, but doesn't
 *   require subsequent requests to include that for "Authorization".
 *
 * - Other standalone registry APIs use and require cookies to handle a
 *   repository session. "quay.io" is an example. See
 *   <https://smartos.org/bugview/DOCKER-380> for some specifics there.
 *
 *
 * The end result is that this library will always attempt to get a session
 * token or cookie by hitting "GET /v1/repositories/$repo/images", whether
 * the particular registry API requires it. Whether the registry is
 * "standalone" doesn't matter.
 *
 *
 * Side-effects:
 * - `this._ensuredSession` is set.
 * - Any cookies are saved.
 * - For token auth, `this.token` and `this._authorization` are set.
 * - `this.endpoints` is set if the response headers include
 *   "X-Docker-Endpoints".
 */
RegistryClientV1.prototype._ensureSession = function _ensureSession(cb) {
    var self = this;
    if (this._ensuredSession) {
        return cb();
    }

    this.log.trace('get session token/cookie');
    this.listRepoImgs(function (err, repoImgs, res) {
        if (err) {
            return cb(err);
        }
        if (res.headers['x-docker-endpoints'] !== undefined) {
            var proto = mod_url.parse(self._indexApi.url).protocol;
            /* BEGIN JSSTYLED */
            // See session.go which appends the API version to the URL.
            this.endpoints = res.headers['x-docker-endpoints']
                .split(/\s*,\s*/g)
                .map(function (e) { return proto + '//' + e; });
            /* END JSSTYLED */
        }
        if (res.headers['x-docker-token'] !== undefined) {
            self.token = res.headers['x-docker-token'];
            self._authorization = 'Token ' + self.token;
        }
        self._ensuredSession = true;
        cb();
    });
};


/**
 * Convenience wrappers on RegistryClientV1._foo for use in `vasync.pipeline`.
 */
function ensureSession(regClient, cb) {
    regClient._ensureSession(cb);
}


RegistryClientV1.prototype._saveCookies = function _saveCookies(url, res) {
    var header = res.headers['set-cookie'];
    if (!header) {
        return;
    }

    var cookie;
    if (Array.isArray(header)) {
        for (var i = 0; i < header.length; i++) {
            cookie = tough.Cookie.parse(header[i]);
            this.log.trace({url: url, cookie: cookie}, 'save cookie');
            this._cookieJar.setCookieSync(cookie, url);
        }
    } else {
        cookie = tough.Cookie.parse(header);
        this.log.trace({url: url, cookie: cookie}, 'save cookie');
        this._cookieJar.setCookieSync(cookie, url);
    }
};


RegistryClientV1.prototype._getCookies = function _getCookies(url) {
    var cookies = this._cookieJar.getCookiesSync(url);
    if (cookies.length) {
        return cookies.join('; ');
    }
    return undefined;
};


/*
 * A light wrapper to make an HTTP request to the registry. It handles
 * some common boilerplate -- e.g. cookie handling.
 *
 *
 * @param opts.client {String} Optional. If not specified, it uses
 *      `this._registryApi`. Some endpoints need to specify
 *      `client: this._indexApi`.
 * @param opts.method {String} Optional.
 * @param opts.followRedirect {Boolean} Optional. False by default. Set to
 *      true to follow redirects. See `followRedirect` here for comparison:
 *      https://github.com/request/request#requestoptions-callback
 * @param opts.maxRedirects {Number} Default 10. See `maxRedirects` here for
 *      comparison: https://github.com/request/request#requestoptions-callback
 * @param opts.* HTTP request options.
 *      ...
 * @param cb {Function}
 */
RegistryClientV1.prototype._request = function _request(opts, cb) {
    assert.object(opts, 'opts');
    assert.optionalObject(opts.client, 'opts.client');
    assert.optionalString(opts.method, 'opts.method');
    assert.optionalBool(opts.followRedirect, 'opts.followRedirect');
    assert.optionalNumber(opts.maxRedirects, 'opts.maxRedirects');
    // ... other restify client opts.
    assert.func(cb, 'cb');

    var self = this;
    var client = opts.client || this._registryApi;
    var method = {
        GET: 'get',
        PUT: 'put',
        POST: 'post',
        DELETE: 'del'
    }[opts.method || 'GET'];
    assert.string(method);
    var followRedirect = Boolean(opts.followRedirect);
    var maxRedirects = (opts.hasOwnProperty('maxRedirects')
        ? opts.maxRedirects : 5);
    assert.ok(maxRedirects > 0);

    var reqOpts = common.objCopy(opts);
    delete reqOpts.client;
    delete reqOpts.method;
    delete reqOpts.followRedirect;
    delete reqOpts.maxRedirects;
    var reqUrl = mod_url.resolve(client.url, reqOpts.path);

    var numRedirs = 0;
    var allReqs = [];
    var allRess = [];
    var lastErr;
    var lastBody;

    // We may want a non-redirect (i.e. non-3xx) response to return. Use a
    // barrier to gate that.
    var barrier = vasync.barrier();
    barrier.on('drain', function _onGetNonRedirResult() {
        if (followRedirect) {
            self.log.trace(
                {res: allRess[allRess.length - 1], numRedirs: numRedirs},
                'finished following redirects');
        }
        // For now at least to keep compat we only return one req and res.
        cb(lastErr, allReqs[0], allRess[allRess.length - 1], lastBody);
    });


    function makeOneReq(oneClient, oneReqOpts) {
        if (followRedirect && numRedirs >= maxRedirects) {
            cb(new errors.TooManyRedirectsError(fmt(
                'maximum number of redirects (%s) hit when requesting %s',
                maxRedirects, reqUrl)));
            return;
        }
        numRedirs += 1;

        if (!oneClient) {
            oneClient = restify.createJsonClient(common.objMerge({
                url: oneReqOpts.url
            }, self._commonHttpClientOpts));
            self._clientsToClose.push(oneClient);
        }

        oneReqOpts.headers = common.objMerge(
            oneReqOpts.headers || {},
            {
                cookie: self._getCookies(oneReqOpts.url)
            });

        oneClient.get(oneReqOpts, function _res(err, req, res, body) {
            lastErr = err;
            allReqs.push(req);
            allRess.push(res);
            lastBody = body;

            if (!err && res) {
                // Use of a raw restify http_client doesn't include `res` in cb.
              //console.log('XXX saving cookies for url %s: %s', oneReqOpts.url, res.headers['set-cookie']);
                self._saveCookies(oneReqOpts.url, res);
            }

            if (followRedirect &&
                (res.statusCode === 302 || res.statusCode === 307))
            {
                var loc = mod_url.parse(res.headers.location);
                makeOneReq(null, {
                    url: loc.protocol + '//' + loc.host,
                    path: loc.path
                });
            } else {
                barrier.done('redirs');
            }
        });
    }


    /*
     * The Authorization header we might have is for the registry host
     * only, not for some other domain to which we might have been redirected
     * (e.g. for file download). The exception is the Docker Hub odd couple:
     * registry-1.docker.io and index.docker.io. They share creds.
     */
    if (client.url.host === this._registryHost ||
            (client.url.host === 'index.docker.io' &&
                this._registryHost === 'registry-1.docker.io')) {
        if (self._authorization) {
            if (!reqOpts.headers) {
                reqOpts.headers = {};
            }
            reqOpts.headers.authorization = self._authorization;
        }
    }

    barrier.start('redirs');
    makeOneReq(client, common.objMerge({url: reqUrl}, reqOpts));
};


/**
 * <https://docs.docker.com/v1.6/reference/api/registry_api/#status>
 */
RegistryClientV1.prototype.ping = function ping(cb) {
    var self = this;
    assert.func(cb, 'cb');

    self._request({
        client: this._indexApi,
        path: '/v1/_ping',
        // Ping should be fast. We don't want 15s of retrying.
        retry: false
    }, function _afterPing(err, req, res, body) {
        if (err) {
            return cb(new VError(err, 'ping attempt to %s failed',
                self._indexUrl));
        }
        return cb(null, body, res, req);
    });
};


/**
 * https://docs.docker.com/reference/api/registry_api/#search
 */
RegistryClientV1.prototype.search = function search(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.term, 'opts.term');
    assert.func(cb, 'cb');

    self._request({
        client: this._indexApi,
        path: '/v1/search',
        query: { q: opts.term },
        headers: {
            'X-Docker-Token': 'true'
        }
    }, function _afterSearch(err, req, res, hits) {
        if (err) {
            return cb(err);
        }
        cb(err, hits, res);
    });
};


/**
 * List images in the given repository.
 *
 * Note: This same endpoint is typically used to get a index.docker.io
 * registry auth token or cookie, and an endpoint URL. See `_ensureToken` for
 * details.
 */
RegistryClientV1.prototype.listRepoImgs = function listRepoImgs(cb) {
    var self = this;
    assert.func(cb, 'cb');

    self._request({
        client: this._indexApi,
        path: fmt('/v1/repositories/%s/images',
            encodeURI(this.repo.remoteName)),
        headers: {
            'X-Docker-Token': 'true'
        }
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
RegistryClientV1.prototype.listRepoTags = function listRepoTags(cb) {
    var self = this;
    assert.func(cb, 'cb');

    var res, repoTags;
    vasync.pipeline({arg: this, funcs: [
        ensureSession,
        function call(_, next) {
            self._request({
                path: fmt('/v1/repositories/%s/tags',
                    encodeURI(self.repo.remoteName))
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
RegistryClientV1.prototype.getImgId = function getImgId(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.tag, 'opts.tag');
    assert.func(cb, 'cb');

    var res, imgId;
    vasync.pipeline({arg: this, funcs: [
        ensureSession,
        function call(_, next) {
            self._request({
                path: fmt('/v1/repositories/%s/tags/%s',
                    encodeURI(self.repo.remoteName),
                    encodeURIComponent(opts.tag))
            }, function _afterCall(err, req, res_, imgId_) {
                if (err) {
                    return next(err);
                }
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
RegistryClientV1.prototype.getImgAncestry = function getImgAncestry(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.imgId, 'opts.imgId');
    assert.func(cb, 'cb');

    var res, ancestry;
    vasync.pipeline({arg: this, funcs: [
        ensureSession,
        function call(_, next) {
            self._request({
                path: fmt('/v1/images/%s/ancestry',
                    encodeURIComponent(opts.imgId)),
                followRedirect: true
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
RegistryClientV1.prototype.getImgJson = function getImgJson(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.imgId, 'opts.imgId');
    assert.func(cb, 'cb');

    var res, imgJson;
    vasync.pipeline({arg: this, funcs: [
        ensureSession,
        function call(_, next) {
            self._request({
                path: fmt('/v1/images/%s/json',
                    encodeURIComponent(opts.imgId)),
                followRedirect: true
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
RegistryClientV1.prototype.getImgLayerStream =
function getImgLayerStream(opts, cb) {
    var self = this;
    assert.object(opts, 'opts');
    assert.string(opts.imgId, 'opts.imgId');
    assert.func(cb, 'cb');

    var nonRedirRes;

    vasync.pipeline({arg: this, funcs: [
        ensureSession,
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

                reqOpts.client = client;
                self._request(reqOpts, function _onConn(connErr, req) {
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
                url: self._registryUrl,
                path: fmt('/v1/images/%s/layer',
                    encodeURIComponent(opts.imgId))
            });
        }
    ]}, function (err) {
        cb(err, nonRedirRes);
    });
};


// --- Exports

function createClient(opts) {
    return new RegistryClientV1(opts);
}

module.exports = {
    pingIndex: pingIndex,
    login: login,
    createClient: createClient
};
