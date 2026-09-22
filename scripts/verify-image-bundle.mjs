// No credential values are ever printed, including on failure.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const bundle=readFileSync('dist/index.html','utf8');
assert.ok(!/sb_secret_[A-Za-z0-9_-]{12,}/.test(bundle),'secret-shaped literal in browser bundle');
for(const jwt of bundle.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[]){
 let payload;try{payload=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString());}catch{continue;}
 assert.notEqual(payload.role,'service_role','privileged JWT in bundle');
}
assert.ok(!/PGlite|electric-sql|playwright-core|pg-protocol|pg-connection-string|node:child_process/.test(bundle),'test-only dependency in production bundle');
console.log('PASS: bundle scan — no secret-shaped key/privileged JWT/test tool detected');
const forbidden=[['sb','secret','test_only_not_a_real_credential'].join('_'),
 ['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'test-signature'].join('.')];
for(const value of forbidden){
 const result=spawnSync('node',['node_modules/vite/bin/vite.js','build'],{
  encoding:'utf8',env:{...process.env,VITE_SUPABASE_PUBLISHABLE_KEY:value},timeout:30000});
 assert.notEqual(result.status,0,'privileged key was not blocked before bundling');
 const output=(result.stdout??'')+(result.stderr??'');
 assert.ok(output.includes('Privileged credential refused'));
 assert.ok(!output.includes(value),'credential leaked to build output');
}
console.log('PASS: build rejects both privileged-key formats before bundling; neither value logged');
