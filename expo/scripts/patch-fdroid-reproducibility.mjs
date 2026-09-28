import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const imageSourceRoot = resolve(
  'node_modules/expo-image/android/src/main/java/expo/modules/image',
);
const modules = [
  ['dataurls/Base64Module.kt', 'Base64Module', 'expo.modules.image.dataurls.Base64Module'],
  ['blurhash/BlurhashModule.kt', 'BlurhashModule', 'expo.modules.image.blurhash.BlurhashModule'],
  ['decodedsource/DecodedModule.kt', 'DecodedModule', 'expo.modules.image.decodedsource.DecodedModule'],
  [
    'okhttp/ExpoImageOkHttpClientGlideModule.kt',
    'ExpoImageOkHttpClientGlideModule',
    'expo.modules.image.okhttp.ExpoImageOkHttpClientGlideModule',
  ],
  ['svg/SVGModule.kt', 'SVGModule', 'expo.modules.image.svg.SVGModule'],
  ['thumbhash/ThumbhashModule.kt', 'ThumbhashModule', 'expo.modules.image.thumbhash.ThumbhashModule'],
];

for (const [relativePath] of modules) {
  const path = resolve(imageSourceRoot, relativePath);
  const source = readFileSync(path, 'utf8');
  const annotationMatches = source.match(/^@GlideModule\r?$/gm) ?? [];

  if (annotationMatches.length === 0 && source.includes('// F-Droid: registered deterministically')) {
    continue;
  }
  if (annotationMatches.length !== 1) {
    throw new Error(`Unexpected Glide annotations in ${relativePath}: ${annotationMatches.length}`);
  }

  writeFileSync(
    path,
    source.replace(/^@GlideModule\r?$/m, '// F-Droid: registered deterministically'),
  );
}

const imports = modules.map(([, , qualifiedName]) => `import ${qualifiedName}`).join('\n');
const delegates = modules
  .map(
    ([, className], index) => `
@GlideModule
class Deterministic${String(index + 1).padStart(2, '0')}${className} : LibraryGlideModule() {
  override fun registerComponents(context: Context, glide: Glide, registry: Registry) {
    ${className}().registerComponents(context, glide, registry)
  }
}`,
  )
  .join('\n');
const deterministicModules = `package expo.modules.image

import android.content.Context
import com.bumptech.glide.Glide
import com.bumptech.glide.Registry
import com.bumptech.glide.annotation.GlideModule
import com.bumptech.glide.module.LibraryGlideModule
${imports}
${delegates}
`;

writeFileSync(resolve(imageSourceRoot, 'DeterministicLibraryGlideModules.kt'), deterministicModules);

console.log('Expo Image Glide modules configured in deterministic source order.');
