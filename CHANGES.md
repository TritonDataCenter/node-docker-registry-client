# node-docker-registry-client Changelog

## 2.0.0 (not yet released)

- Fix reliability issues with v2 download of large layer files.
  My understanding is that this was due to <https://github.com/nodejs/node/issues/3055>.
  This module is now avoiding `agent: false`, at least for the blob downloads.


## 1.4.1

- DOCKER-549 Fix pulling from quay.io *private* repos.


## 1.4.0

- Test suites improvements to actually check against docker.io, quay.io, and
  optionally a jfrog artifactory Docker v1 repo.
- DOCKER-380: Support for quay.io. Quay.io uses cookies for repository sessions.
  This involved refactoring the standalone/token handling to be more generically
  for "sessions". It simplified the code quite a lot.
- DOCKER-540 Update examples to take a '-k,--insecure' option to allow
  access to registries with self-signed certs.
- DOCKER-539 Allow passing through a proxy for `drc.login(...)`.
- v1 Ping should send auth headers, if any. A private registry might very well
  require auth on the ping endpoint.
- v1 Search doesn't need to do a ping. Presumably this is historical for
  mistakenly thinking there was a need to determine `this.standalone`.


## 1.3.0

- [DOCKER-526] HTTP proxy support. This should work either (a) with the
  `http_proxy`/`https_proxy` environment variables, or (b) in code like this:

        var url = require('url');
        var drc = require('docker-registry-client');
        var client = drc.createClient({
            name: 'busybox',
            proxy: url.parse('http://my-proxy.example.com:8080'),
            //...
        });

  One side-effect of this change is the underlying HTTP connections no longer
  set `agent: false` to avoid Node's default HTTP agent. This means that if you
  are **not** using a proxy, you will now get keep-alive, which means a
  persistent connection that could hold your node script/app from exiting. All
  users of this client should explicitly close the client when complete:

        client.close();

  The "example/\*.js" scripts all do this now.



## 1.2.2

- [pull #4] Fix `getImgAncestry` when using node 0.12 (by github.com/vincentwoo).


## 1.2.1

- Sanitize the non-json (text/html) `err.message` from `listRepoImgs` on a 404.
  See before and after: https://gist.github.com/trentm/94c11e1243fb7fd4fe90


## 1.2.0

- Add `drc.login(...)` for handling a Docker Engine would use for the Remote
  API side of `docker login`.


## 1.1.0

- `RegistryClient.ping` will not retry so that a ping failure check is quick.
  Without this it was retrying for ~15s.
- `RegistryClient.search` now does a ping check before searching (fail fast).
- `createClient({userAgent: ...})` option. Defaults to
  'node-docker-registry-client/$ver (...)'.
- A client to localhost will default to the 'http' scheme to (mostly) match
  docker-docker's behaviour here.


## 1.0.0

A major re-write with lots of backwards compat *breakage*.  This release adds
support for indeces/registries other than the "official" docker.io default.
It changes usage to feel a bit more like docker/docker.git's "registry" package.
So far this still only supports Registry API v1.

Basically the whole usage has changed. There is no longer a "Registry Session",
session handling is done lazily under the hood. There is no longer a separate
"Index API Client", the only client object is the "RegistryClient" setup via:

    var client = drc.createClient({...});

There *is* a `drc.pingIndex()` which can be used to check that a registry
host (aka an "index" from the old separation of an "Index API") is up.
Usage is best learned from the complete set of examples in "examples/".


- **Backward incompat change** in return value from `parseRepoAndTag`.
  In addition to adding support for the optional index prefix, and a
  "@DIGEST" suffix, the fields on the return value have been changed to
  more closely match Docker's `RepositoryInfo` fields:

        {
            index: {
                name: INDEX_NAME
                official: BOOL
            },
            remoteName: ...,
            localName: ...,
            canonicalName: ...,
            official: BOOL
        }

  E.g.

        {
            index: {
                name: 'docker.io'
                official: true
            },
            remoteName: 'library/mongo',
            localName: 'mongo',
            canonicalName: 'docker.io/mongo',
            official: true
        }

  See <https://github.com/docker/docker/blob/2e4d36ed80855375231501983f19616ba0238a84/registry/types.go#L71-L96>
  for an example.

  Before:

        {
            ns: NS,
            name: NAME,
            repo: NS/NAME,
            tag: TAG || 'latest'
        }

  e.g.:

        {
            ns: 'library',
            name: 'mongo',
            repo: 'library/mongo',
            tag: '1.2.3'
        }



## 0.3.2

Note: Any 0.x work (I don't anticipate any) will be on the "0.x" branch.

- Update deps to move fwd to 0.12-supporting versions of things.

## 0.3.1

- Switch to '^x.y.x' for deps to allow for node\_modules dedupe in
  apps using this module.

## 0.3.0

- Add `RegistrySession.getImgId()`, `parseRepoAndTag()`,
  `RegistrySession.getImgLayerStream()`.
- Export `parseRepoAndTag()` function.
- Add `repoImgs` to object returned by `IndexClient.getRepoAuth`. For images
  with "checksum" values this could possibly be useful for validation of
  subsequent downloads.
- URL encode params in API call paths.


## 0.2.0

Started changelog after this version.
