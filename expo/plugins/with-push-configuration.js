const fs=require('node:fs');
const path=require('node:path');
const {withDangerousMod}=require('expo/config-plugins');
function validatePushConfiguration(file,pkg){
 if(!file)throw new Error('Missing Firebase Android client configuration');
 const config=JSON.parse(fs.readFileSync(file,'utf8'));
 if(config.private_key || config.type==='service_account')throw new Error('A private FCM key must never enter the app build');
 if(!config.project_info?.project_number || !config.project_info?.project_id || !config.client?.some(c=>c.client_info?.android_client_info?.package_name===pkg && c.api_key?.some(k=>k.current_key)))throw new Error('Invalid Firebase configuration or Android package mismatch');
}
module.exports=function withPushConfiguration(config){
 return withDangerousMod(config,['android',async mod=>{
   const file=mod.android?.googleServicesFile;
   validatePushConfiguration(file ? path.resolve(mod.modRequest.projectRoot,file):undefined,mod.android?.package);
   return mod;
 }]);
};
module.exports.validatePushConfiguration=validatePushConfiguration;
