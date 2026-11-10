import { describe, expect, it } from 'vitest';

const {
  disableReactNativeJavaAlignment,
  enableFdroidMinification,
  injectFdroidJvmTargets,
  injectFdroidReleaseBuild,
} = require('../../plugins/with-fdroid-release-build');

describe('F-Droid release build plugin', () => {
  it('keeps Java and Kotlin bytecode on JVM 17 while the runner uses JDK 21', () => {
    const generated = injectFdroidJvmTargets('apply plugin: "expo-root-project"\n');

    expect(generated).toContain('KotlinJvmCompile');
    expect(generated).toContain('replaceFirst(/^kaptGenerateStubs/, "compile")');
    expect(generated).toContain('javaTask?.targetCompatibility');
    expect(generated).toContain('JvmTarget.fromTarget(bytecodeTarget)');
    expect(injectFdroidJvmTargets(generated)).toBe(generated);
  });

  it('disables React Native automatic JDK 17 toolchain selection', () => {
    const properties = disableReactNativeJavaAlignment([
      { type: 'property', key: 'android.useAndroidX', value: 'true' },
    ]);

    expect(properties).toContainEqual({
      type: 'property',
      key: 'react.internal.disableJavaVersionAlignment',
      value: 'true',
    });
  });

  it('enables R8 for F-Droid release builds without duplicating the property', () => {
    const properties = [{ type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' }];
    expect(enableFdroidMinification(properties)).toEqual([{ type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'true' }]);
    expect(enableFdroidMinification([])).toEqual([{ type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'true' }]);
  });

  it('keeps signing conditional for unsigned F-Droid releases', () => {
    const generated = injectFdroidReleaseBuild(`
android {
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`);

    expect(generated).toContain('if (!isFdroidBuild)');
    expect(generated).toContain('signingConfig signingConfigs.debug');
    expect(generated.indexOf('signingConfig signingConfigs.debug'))
      .toBeLessThan(generated.indexOf('if (!isFdroidBuild)'));
  });
});
