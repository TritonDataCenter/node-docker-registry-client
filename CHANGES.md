# node-docker-registry-client Changelog

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
