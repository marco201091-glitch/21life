const {
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} = require('expo/config-plugins');

const APP_MARKER = '// phyrexian-fdroid-release-build';
const PROJECT_MARKER = '// phyrexian-fdroid-jvm-targets';
const DISABLE_ALIGNMENT_PROPERTY = 'react.internal.disableJavaVersionAlignment';

function injectFdroidReleaseBuild(contents) {
  if (contents.includes(APP_MARKER)) return contents;

  const androidNeedle = '\nandroid {';
  if (!contents.includes(androidNeedle)) {
    throw new Error('Unable to locate Android Gradle android block');
  }

  let next = contents.replace(
    androidNeedle,
    `\n${APP_MARKER}\ndef isFdroidBuild = (findProperty('fdroidBuild') ?: System.getenv("EXPO_PUBLIC_FDROID_BUILD") ?: "false").toBoolean()\n\nandroid {`,
  );

  const signingLine = '            signingConfig signingConfigs.debug';
  const debugSigningIndex = next.indexOf(signingLine);
  const releaseSigningIndex = next.indexOf(
    signingLine,
    debugSigningIndex + signingLine.length,
  );
  if (debugSigningIndex < 0 || releaseSigningIndex < 0) {
    throw new Error('Unable to locate Android release signing configuration');
  }

  const conditionalSigning =
    '            if (!isFdroidBuild) {\n                signingConfig signingConfigs.debug\n            }';
  next = `${next.slice(0, releaseSigningIndex)}${conditionalSigning}${next.slice(releaseSigningIndex + signingLine.length)}`;

  return next;
}

function injectFdroidJvmTargets(contents) {
  if (contents.includes(PROJECT_MARKER)) return contents;

  return `${contents.trimEnd()}

${PROJECT_MARKER}
gradle.projectsEvaluated {
  subprojects { subproject ->
    subproject.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinJvmCompile).configureEach { kotlinTask ->
      def javaTaskName = kotlinTask.name
        .replaceFirst(/^kaptGenerateStubs/, "compile")
        .replaceFirst(/^kapt/, "compile")
        .replaceFirst(/Kotlin$/, "JavaWithJavac")
      def javaTask = subproject.tasks.findByName(javaTaskName)
      def bytecodeTarget = javaTask?.targetCompatibility ?: JavaVersion.VERSION_17.toString()
      compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.fromTarget(bytecodeTarget))
    }
  }
}
`;
}

function disableReactNativeJavaAlignment(properties) {
  const existing = properties.find(
    (item) => item.type === 'property' && item.key === DISABLE_ALIGNMENT_PROPERTY,
  );
  if (existing) {
    existing.value = 'true';
    return properties;
  }
  return [
    ...properties,
    { type: 'comment', value: 'F-Droid uses JDK 21 while emitting Java/Kotlin 17 bytecode.' },
    { type: 'property', key: DISABLE_ALIGNMENT_PROPERTY, value: 'true' },
  ];
}

function enableFdroidMinification(properties) {
  const key = 'android.enableMinifyInReleaseBuilds';
  const existing = properties.find(item => item.type === 'property' && item.key === key);
  if (existing) existing.value = 'true';
  else properties.push({ type: 'property', key, value: 'true' });
  return properties;
}

module.exports = function withFdroidReleaseBuild(config) {
  if (process.env.APP_VARIANT !== 'fdroid' && process.env.EXPO_PUBLIC_FDROID_BUILD !== 'true') {
    return config;
  }

  let nextConfig = withGradleProperties(config, (gradleConfig) => {
    gradleConfig.modResults = disableReactNativeJavaAlignment(gradleConfig.modResults);
    gradleConfig.modResults = enableFdroidMinification(gradleConfig.modResults);
    return gradleConfig;
  });

  nextConfig = withProjectBuildGradle(nextConfig, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('F-Droid JVM configuration requires Groovy build.gradle');
    }
    gradleConfig.modResults.contents = injectFdroidJvmTargets(
      gradleConfig.modResults.contents,
    );
    return gradleConfig;
  });

  return withAppBuildGradle(nextConfig, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('F-Droid release build plugin requires Groovy build.gradle');
    }
    gradleConfig.modResults.contents = injectFdroidReleaseBuild(
      gradleConfig.modResults.contents,
    );
    return gradleConfig;
  });
};

module.exports.injectFdroidReleaseBuild = injectFdroidReleaseBuild;
module.exports.injectFdroidJvmTargets = injectFdroidJvmTargets;
module.exports.disableReactNativeJavaAlignment = disableReactNativeJavaAlignment;

module.exports.enableFdroidMinification = enableFdroidMinification;
