#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright (c) 2014, Joyent, Inc.
#

#
# node-docker-registry-client Makefile
#

#
# Files
#
JS_FILES	:= $(shell find examples lib -name '*.js')
JSON_FILES	 = package.json
JSL_CONF_NODE	 = tools/jsl.node.conf
JSL_FILES_NODE	 = $(JS_FILES)
JSSTYLE_FILES	 = $(JS_FILES)
JSSTYLE_FLAGS	 = -f tools/jsstyle.conf

include ./tools/mk/Makefile.defs


#
# Repo-specific targets
#
.PHONY: all
all:
	npm install

.PHONY: test
test:
	@echo "nothing here :("


include ./tools/mk/Makefile.deps
include ./tools/mk/Makefile.targ
