# Native packaging

Status: **pre-release, not published on the AUR or Flathub.**
Project: `Frezzaroukos/anabasis` · version `0.1.0` · license **MIT**
(`LICENSE`, confirmed in the repository).

This document records the native artifacts that exist locally, how to install
them, and what is still missing before an AUR or Flathub submission.

## Verified artifacts (2026-11-03)

The release binaries live under `src-tauri/target/release/bundle/`, which is
gitignored. They are **not committed**; only their checksums are recorded in
`packaging/SHA256SUMS`.

| Artifact | Path | Size | SHA256 |
|---|---|---:|---|
| Debian package | `src-tauri/target/release/bundle/deb/Anabasis_0.1.0_amd64.deb` | 5,775,370 B | `52efecc0d43dd972d09c7b7b44a3f948afac17f75338de0efda245e5e8342886` |
| AppImage | `src-tauri/target/release/bundle/appimage/Anabasis_0.1.0_amd64.AppImage` | 107,358,712 B | `0fe79ac911857f59177ed0c4d65c663e16b2855469dc51c1b8e71643629b76ea` |
| Installed binary (local) | `~/.local/bin/anabasis` | 14,847,400 B | `1ac80c58b6149326a0b4f48fa1c5f708b784a110bcedcb73545a848e3fcd7ec2` |

The installed binary is byte-identical to
`src-tauri/target/release/anabasis`. It is a local install, not a release
asset.

Build timestamps were 2026-11-03 23:15-23:16 local time. The AppImage was built
with `NO_STRIP=1`. There is no tag and no GitHub release for these artifacts;
reproducibility from the current `main` was not verified (the working tree was
being modified by other sessions during this inspection).

Verify from the repository root:

```bash
sha256sum -c packaging/SHA256SUMS
```

## Install

### Debian / Ubuntu (.deb)

```bash
sudo apt install ./Anabasis_0.1.0_amd64.deb
```

`apt` resolves the declared dependencies (`libwebkit2gtk-4.1-0`,
`libgtk-3-0`). Equivalent fallback:

```bash
sudo dpkg -i Anabasis_0.1.0_amd64.deb
sudo apt-get install -f
```

Verified: package metadata (`ar` + `tar`), payload, desktop file and icons.
**Not tested:** actual installation or first launch on Debian/Ubuntu. The
package is `amd64` only. Do not install it on Arch with `pacman`.

### AppImage

```bash
chmod +x Anabasis_0.1.0_amd64.AppImage
./Anabasis_0.1.0_amd64.AppImage
```

The AppImage is self-contained and does not install system files. If FUSE is
unavailable, `./Anabasis_0.1.0_amd64.AppImage --appimage-extract-and-run` is
the usual fallback (**not tested**). Desktop integration (menu entry, icon) is
not automatic; use the `.deb`, the AUR package, or a third-party AppImage
integrator.

Verified: `--appimage-extract` succeeds and produces `squashfs-root/AppRun`,
`squashfs-root/usr/bin/anabasis`, `Anabasis.desktop` and hicolor icons at
32/64/128/256/512 px. **Not tested:** direct execution via FUSE on this
machine.

### Arch Linux (source build, pre-release)

There is no official Arch package and no AUR submission. A scaffold is provided
for local testing:

```bash
cd packaging
makepkg -si
```

It builds `anabasis-git` from `main` (`npm ci` + `npm run tauri build --
--no-bundle`) and installs the binary, desktop entry, icons and MIT license
under `/usr`. It is explicitly marked **pre-release**, is not AUR-clean yet
(npm and cargo fetch dependencies during build), and **the full build/install
was not run in this task**. Only `makepkg --printsrcinfo` was validated.

A future `anabasis-bin` package is blocked until a real `v0.1.0` tag and GitHub
release exist; see [AUR status](#aur-status).

### Local user install (`scripts/install-desktop.sh`)

Existing project script, for a development build:

```bash
npm run tauri build -- --no-bundle
./scripts/install-desktop.sh
```

It performs a **user-local** install, without `sudo`:

- requires the built binary at `src-tauri/target/release/anabasis`;
- installs it to `~/.local/bin/anabasis`;
- installs icons to `~/.local/share/icons/hicolor/{32x32,64x64,128x128,256x256,512x512}/apps/anabasis.png`
  from `src-tauri/icons/{32x32,64x64,128x128,128x128@2x,icon}.png`;
- writes `~/.local/share/applications/anabasis.desktop` with an absolute
  `Exec=` path, `Icon=anabasis`, `Categories=Utility;Sports;` and
  `StartupWMClass=anabasis`;
- removes the obsolete `~/.local/share/applications/anabasis-web.desktop`;
- refreshes the desktop database and icon cache when the tools are present.

It does **not** install GTK/WebKit dependencies and does not touch `/usr`.
This script was inspected, not re-run during this task.

## AUR status

**Not published.** Checked on 2026-11-03:

- `git ls-remote --tags https://github.com/Frezzaroukos/anabasis.git` returned
  no tags (the only local tag is `pre-rewrite-20261023`, not a release).
- `gh release list -R Frezzaroukos/anabasis` returned no releases.
- AUR RPC (`/rpc/v5/info`) returned `resultcount: 0` for `anabasis`,
  `anabasis-bin` and `anabasis-git`.

Consequences:

- `anabasis-bin` cannot be written honestly: it needs a published release asset
  URL and a real checksum.
- `packaging/PKGBUILD` is therefore a source-build scaffold named
  `anabasis-git`, not an AUR submission.
- The required release tag is **`v0.1.0`** (matching `package.json`,
  `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`). It must point at the
  exact commit used for the artifacts, and the GitHub release must contain the
  `.deb` and AppImage.
- Before submitting, add a real maintainer email (the PKGBUILD currently has a
  `TODO` placeholder), vendor or otherwise account for npm/cargo download
  steps, and submit from an AUR account. None of that was done here.

### Checksum policy

- `source=()` uses a VCS checkout, so its checksum is `SKIP` — standard for a
  `-git` package, not an invented checksum.
- The separately sourced desktop file has its real SHA256 in the PKGBUILD.
- `packaging/SHA256SUMS` contains only measured values for the local artifacts.
- A future `anabasis-bin` PKGBUILD must use checksums produced by `sha256sum`
  (or `updpkgsums`) from the downloaded release assets. Never fill in a
  placeholder hash.

## Flathub status

**Not published.** There is no Flatpak manifest in the repository (only the
existing GitHub CI/pages workflows). A Flathub submission would need a manifest
for app id `dev.axonos.anabasis`, a runtime/SDK choice, Rust and Node build
extensions or vendored sources, and review of sandbox permissions (Wayland/X11,
GPU, and network for the optional sync). Nothing was built, tested or submitted.

## Checks performed

- `sha256sum` on the `.deb`, AppImage and installed binary; values above.
- `sha256sum -c packaging/SHA256SUMS` — both artifacts `OK`.
- Debian payload inspected with `ar x` + `tar -tzf data.tar.gz` (no
  `dpkg-deb` dependency): binary, desktop file and hicolor icons at
  32/64/128/256/512 px are present.
- AppImage `--appimage-extract` in `/tmp` — exit 0; binary, desktop file and
  icons present in `squashfs-root`.
- `desktop-file-validate packaging/anabasis.desktop` — exit 0 (one hint:
  `Sports` may be paired with `Education` or `Science`; not an error).
- `bash -n packaging/PKGBUILD` — exit 0; `shellcheck -s bash` — exit 0.
- `makepkg --printsrcinfo` on a copy of `packaging/` — exit 0 and expected
  fields.

## Not tested / blockers

- `makepkg -si` full source build and install; build duration and dependency
  resolution on a clean Arch system.
- Direct AppImage execution (FUSE or `--appimage-extract-and-run`).
- `.deb` installation and launch on Debian/Ubuntu, and desktop-menu launch.
- AUR submission; no tag, release, asset URLs or maintainer email yet.
- Flathub/Flatpak manifest, build and review.
- Reproducibility from a pinned commit.
