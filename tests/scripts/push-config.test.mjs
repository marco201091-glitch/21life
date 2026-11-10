import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const config = require("../../expo/app.config.js");
test("F-Droid configuration excludes Firebase and native push", () => {
  process.env.APP_VARIANT = "fdroid";
  try {
    const c = config();
    assert.equal(c.android.googleServicesFile, undefined);
    assert(!c.plugins.some(p => (Array.isArray(p) ? p[0] : p) === "expo-notifications"));
  } finally { delete process.env.APP_VARIANT; }
});
import { mkdirSync,writeFileSync,mkdtempSync } from 'node:fs';
import {resolve,join} from 'node:path';
const {validatePushConfiguration}=require('../../expo/plugins/with-push-configuration.js');
test('Android prebuild refuses missing, private-key or wrong-package Firebase files',()=>{
 assert.throws(()=>validatePushConfiguration(undefined,'com.phyrexianarena.app'),/Missing/);
 mkdirSync(resolve('artifacts'),{recursive:true});
 const root=mkdtempSync(resolve('artifacts','firebase-test-'));const file=join(root,'google-services.json');
 writeFileSync(file,JSON.stringify({type:'service_account',private_key:'not-a-real-key'}));assert.throws(()=>validatePushConfiguration(file,'com.phyrexianarena.app'),/private/);
 const value={project_info:{project_number:'123',project_id:'test'},client:[{client_info:{android_client_info:{package_name:'com.phyrexianarena.app'}},api_key:[{current_key:'public-test-key'}]}]};
 writeFileSync(file,JSON.stringify(value));assert.throws(()=>validatePushConfiguration(file,'com.phyrexianarena.app.dev'),/package/);assert.doesNotThrow(()=>validatePushConfiguration(file,'com.phyrexianarena.app'));
});
