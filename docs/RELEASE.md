# Release build for Google Play

Google Play accepts a signed Android App Bundle (AAB). Play App Signing keeps the final
app signing key; you sign uploads with your own **upload key**. The key and its passwords
never go into the repository.

## 1. Create the upload key (once)

Run it yourself and choose the passwords; keep the keystore and passwords backed up
(a lost upload key can be reset through Play Console support, but it takes days).

```sh
mkdir -p ~/.kairo && chmod 700 ~/.kairo
.sdk/java/*/Contents/Home/bin/keytool -genkeypair -v -keystore ~/.kairo/upload-keystore.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

Then create `~/.kairo/upload-keystore.properties` (`chmod 600`):

```properties
storeFile=/Users/<you>/.kairo/upload-keystore.jks
storePassword=<keystore password>
keyAlias=upload
keyPassword=<key password>
```

Another location can be set with `KAIRO_SIGNING_PROPERTIES=/path/to/file`.

## 2. Build

Bump `versionCode` (and `versionName` if needed) in `android/app/build.gradle` for every upload, then:

```sh
VITE_API_BASE=https://11xsloperator.app:47613/cyprus-weather ./scripts/build-release.sh
```

The signed bundle is written to `output/kairo-<versionName>-<versionCode>.aab`.
The script refuses to run without the signing file or with a non-HTTPS backend. Release
builds do not allow cleartext HTTP (that is enabled only in the debug manifest).

## 3. Play Console

- Opt in to Play App Signing (default for new apps) and upload the AAB.
- Store listing, Data safety answers and the privacy policy URL: `docs/STORE_LISTING.md`.
- Privacy policy page: `docs/privacy-policy.md`, served by GitHub Pages from the `/docs` folder of `main`.
