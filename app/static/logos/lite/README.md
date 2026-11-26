# Lite feather icon

`feather-source.png` is the approved second icon concept: a black cat and
feather silhouette on an ivory rounded tile, with transparent outer margins.
Created with the built-in imagegen tool, then exported to macOS formats with
Apple's tools. The original artwork and transparent-edge refinement were
generated using this direction:

> A minimal GitHub-inspired cat head joined to a swept feather tail, three
> tapered cuts, one continuous black silhouette on an ivory ceramic macOS tile.
> Preserve the approved silhouette and tile; remove the surrounding studio
> background and keep transparent corners, without labels or new elements.

Run `bash script/build-lite-icon.sh` from the repository root to regenerate:

- `app/static/logos/prod/icon-logo-legacy.icns`
- `app/static/logos/prod/Assets.car` (`icon-logo` catalog entry)
- `app/static/common/logo-64x64@2x.png`

Both the ICNS and asset catalog must be updated: newer macOS versions can use
the catalog named by `CFBundleIconName` instead of the legacy ICNS. These assets
do not change the bundle identifier, product name, or user-data directory.
