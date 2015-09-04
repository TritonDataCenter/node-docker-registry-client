/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

var assert = require('assert-plus');
var fmt = require('util').format;
var restify = require('restify');
var vasync = require('vasync');
var VError = require('verror').VError;

var common = require('./common');
var reg1 = require('./registry-client-v1');



// --- exports

module.exports = {
    // XXX createClient: createClient,

    createClientV1: reg1.createClient,
    pingIndexV1: reg1.pingIndex,
    loginV1: reg1.login,

    DEFAULT_INDEX_NAME: common.DEFAULT_INDEX_NAME,
    DEFAULT_TAG: common.DEFAULT_TAG,
    parseRepo: common.parseRepo,
    parseIndex: common.parseIndex,
    parseRepoAndTag: common.parseRepoAndTag
};
