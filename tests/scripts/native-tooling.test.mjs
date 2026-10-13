import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('EAS disables source map upload only for Dev and keeps production upload enabled',()=>{
  const eas=JSON.parse(readFileSync('expo/eas.json','utf8'));
  for(const profile of Object.values(eas.build))
    assert.equal(profile.env.SENTRY_DISABLE_AUTO_UPLOAD,profile.env.APP_VARIANT==='dev'?'true':'false');
});
test('unsigned iOS recipe preserves the selected profile upload policy',()=>{
  const recipe=readFileSync('expo/.eas/build/unsigned-ios.yml','utf8');
  assert.doesNotMatch(recipe,/export SENTRY_DISABLE_AUTO_UPLOAD=true/);
});
