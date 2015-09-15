/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

var test = require('tape');

var errors = require('../lib/errors');


// --- Tests

test('InternalError call signatures', function (tt) {

    var cause = new Error('boom');

    tt.test(' message', function (t) {
        var err = new errors.InternalError('hi there');
        t.ok(err);
        t.equal(err.message, 'hi there');
        t.equal(err.code, 'InternalError');
        t.end();
    });

    tt.test(' cause', function (t) {
        var err = new errors.InternalError(cause);
        t.ok(err);
        t.ok(err.cause);
        t.equal(err.message, 'error: boom');
        t.equal(err.code, 'InternalError');
        t.end();
    });

    tt.test(' cause, message', function (t) {
        var err = new errors.InternalError(cause, 'hi there');
        t.ok(err);
        t.ok(err.cause);
        t.equal(err.message, 'hi there: boom');
        t.equal(err.code, 'InternalError');
        t.end();
    });

    tt.test(' fields with cause, message', function (t) {
        var err = new errors.InternalError(
            {err: cause, answer: 42}, 'hi there');
        t.ok(err);
        t.ok(err.cause);
        t.equal(err.message, 'hi there: boom');
        t.equal(err.code, 'InternalError');
        t.equal(err.answer, 42);
        t.end();
    });

    tt.test(' fields, message', function (t) {
        var err = new errors.InternalError(
            {answer: 42}, 'hi there');
        t.ok(err);
        t.equal(err.message, 'hi there');
        t.equal(err.code, 'InternalError');
        t.equal(err.answer, 42);
        t.end();
    });

    tt.test(' fields, message with formatting', function (t) {
        var err = new errors.InternalError(
            {answer: 42}, 'hi there: num=%d %s', 15, 'bar', 'extra');
        t.ok(err);
        t.equal(err.message, 'hi there: num=15 bar extra');
        t.equal(err.code, 'InternalError');
        t.equal(err.answer, 42);
        t.end();
    });

});
