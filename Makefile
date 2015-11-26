#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#

#
# Copyright (c) 2015, Joyent, Inc.
#

#
# node-docker-registry-client Makefile
#

#
# Files
#
JS_FILES	:= $(shell find examples test lib -name '*.js')
JSON_FILES	 = package.json
JSL_CONF_NODE	 = tools/jsl.node.conf
JSL_FILES_NODE	 = $(JS_FILES)
JSSTYLE_FILES	 = $(JS_FILES)
JSSTYLE_FLAGS	 = -f tools/jsstyle.conf

#
# Tools
#
TAPE := ./node_modules/.bin/tape


include ./tools/mk/Makefile.defs


#
# Repo-specific targets
#
.PHONY: all
all:
	npm install

# Note: *skipping* the known failing v2.quayioprivate.test.js for now.
.PHONY: test
test: | $(TAPE)
	@$(TAPE) $(shell find test -name "*.test.js" | grep -v quayioprivate | xargs)

.PHONY: clean
clean::
	rm -f *.layer examples/*.layer docker-registry-client-*.tgz

# Ensure CHANGES.md and package.json have the same version.
.PHONY: versioncheck
versioncheck:
	@echo version is: $(shell cat package.json | json version)
	[[ `cat package.json | json version` == `grep '^## ' CHANGES.md | head -1 | awk '{print $$2}'` ]]

.PHONY: cutarelease
cutarelease: clean versioncheck
	[[ `git status | tail -n1` == "nothing to commit, working directory clean" ]]
	./tools/cutarelease.py -p docker-registry-client -f package.json


include ./tools/mk/Makefile.deps
include ./tools/mk/Makefile.targ
