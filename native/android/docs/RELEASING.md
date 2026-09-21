# Releasing

Releases are cut by pushing a **`v*`** tag. GitHub Actions does the rest.

```bash
git tag v0.14.0
git push origin v0.14.0
```

`.github/workflows/android-apk.yml` runs the tests, assembles the release APK and attaches it to a
GitHub release named after the tag. Prefer `v0.14.0` over `android-v0.14.0`: installs still on
0.12.0 compare tags with a checker that does not strip the `android-` prefix, so `android-v*`
never looks newer to them.

## Updating on a Fire Stick

**Do not uninstall.** Same package id + higher `versionCode` + the same signing key = Android
upgrades in place and keeps providers, favourites and history.

0.12.0 through 0.16.0 were each signed with a *different* CI debug keystore, so overlaying those
builds fails. **0.16.1 onwards share `native/android/debug.keystore`.** Anyone still on 0.16.0
or older has to uninstall once, then install 0.16.1; later cuts overlay again.

- In the app: a prompt appears within ~30 minutes of a new release, or immediately from
  **Settings → About → Check for updates**.
- Or open Downloader and enter `8417717` again — that downloads `XTREAM.apk` over the existing
  install.

## Signing

Release builds use the checked-in **`debug.keystore`** (alias `androiddebugkey`, password
`android`) unless `KEYSTORE_PATH` secrets are set. That key is public — it only exists so every
CI run stamps the APK the same way. **Set up a private upload keystore before announcing the
project publicly.** Switching to that later is another one-time uninstall.

### Setting up real signing

1. Generate a keystore:

   ```bash
   keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 4096 \
     -validity 10000 -alias opentv
   ```

2. Add these repository secrets under **Settings → Secrets and variables → Actions**:
   `KEYSTORE_BASE64` (the output of `base64 -i upload.jks`), `KEYSTORE_PASSWORD`, `KEY_ALIAS`,
   `KEY_PASSWORD`.

3. That is all — `release.yml` and `build.gradle.kts` already pick them up. The release notes
   will report `signed: yes` instead of `debug-key`.

**The keystore must belong to the project, not to one person.** A single maintainer holding
the only copy is the same single point of failure this project exists to avoid — if they go
quiet, nobody can ship an upgrade, and every user is stranded on whatever version they have.
Share it among at least two maintainers, and back it up somewhere that is not one laptop.

Losing the keystore is unrecoverable. There is no reset.

## Version numbers

Bump `versionCode` and `versionName` in `app/build.gradle.kts`. `versionCode` must increase on
every release; Android uses it, not `versionName`, to decide what counts as an upgrade.
