"""Build the development-network APK using the project's private release key."""
import os
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
env = dict(os.environ)
signing = root / '.local/android-signing/build.env'
if not signing.exists():
    raise SystemExit('Run node scripts/prepare-android.mjs to create a private release certificate.')
for line in signing.read_text().splitlines():
    key, separator, value = line.partition('=')
    if separator and key.startswith('SCOUTVAULT_'):
        env[key] = value
env.setdefault('JAVA_HOME', str(root / '.local/java21/jdk-21.0.13.1+2'))
env.setdefault('ANDROID_HOME', str(root / '.local/android-sdk'))
env.setdefault('ANDROID_SDK_ROOT', env['ANDROID_HOME'])
env.setdefault('GRADLE_USER_HOME', str(root / '.local/gradle'))
subprocess.run([
    './gradlew', ':app:assembleRelease', '--no-daemon', '--max-workers=1',
    '-PreactNativeArchitectures=arm64-v8a', '-Dorg.gradle.parallel=false',
    '-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=1024m -XX:TieredStopAtLevel=1',
], cwd=root / 'mobile/android', env=env, check=True)
