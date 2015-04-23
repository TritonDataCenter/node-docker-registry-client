# node-docker-registry-client Changelog

## 0.3.2 (not yet released)

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
