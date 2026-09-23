// Service/gateway fault injection in jsdom. Network is MOCKED; never Supabase E2E.
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const photo = readFileSync('public/images/products/jelly-strawberry.jpg');
const code = buildSync({stdin:{contents:`
import * as images from './src/services/productImages';
import * as files from './src/utils/imageFile';
import * as catalog from './src/services/catalogSync';
import * as catalogReaders from './src/services/catalog';
import * as gateway from './src/services/supabaseProductImages';
import React from 'react'; import {createRoot} from 'react-dom/client';
import ProductVisual from './src/components/ProductVisual';
window.renderVisual = url => {
  if (!window.visualRoot) { const el=document.createElement('div'); el.id='visual-test'; document.body.appendChild(el); window.visualRoot=createRoot(el); }
  window.visualRoot.render(React.createElement(ProductVisual,{imageUrl:url,name:'محصول',color:'#900',emoji:'',eager:true}));
};
window.imageTest = {images,files,catalog,gateway,catalogReaders};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',
  define:{'process.env.NODE_ENV':'"test"','import.meta.env.VITE_SUPABASE_URL':'"https://test.supabase.co"',
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'"sb_publishable_test"','import.meta.env.VITE_ADMIN_AUTH_MODE':'"supabase"',
    'import.meta.env.BASE_URL':'"/"','import.meta.env.VITE_API_BASE_URL':'""'},logLevel:'silent'}).outputFiles[0].text;
let passed=0; const ok=s=>{passed++;console.log('PASS: '+s)};
async function setup() {
 const product={id:'jelly-strawberry',category:'jelly',flavor_id:'strawberry-j',name:'ژله توت فرنگی',short_name:'توت فرنگی',category_label:'ژله',image_url:'images/products/jelly-strawberry.jpg',active:true};
 const legacy={id:'aaaaaaaa-0000-4000-8000-000000000001',product_id:product.id,storage_bucket:'site-public',storage_path:product.image_url,storefront_url:product.image_url,source:'legacy',is_primary:true,alt_text:'قدیمی',sort_order:0};
 const state={product,rows:[legacy],objects:new Set(),queue:[],receipts:new Map(),now:0,flags:{},calls:[],gate:null};
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 const fetchImpl=async(input,init={})=>{
   const url=new URL(typeof input==='string'?input:input.url); const body=typeof init.body==='string'?JSON.parse(init.body):{};
   const method=init.method??'GET';state.calls.push({path:url.pathname,method,body});
   const path=url.pathname;
   if(path.endsWith('/rpc/product_image_api_version'))return json(3);
   if(path.endsWith('/products'))return json([product]);
   if(path.endsWith('/product_variants')||path.endsWith('/inventory'))return json([]); // deliberately variantless
   if(path.endsWith('/product_images')){
     if(state.flags.readFail && url.searchParams.has('id'))throw new TypeError('Failed to fetch');
     const id=url.searchParams.get('id')?.slice(3);return json(state.rows.filter(r=>!id||r.id===id));
   }
   if(path.includes('/storage/v1/object/product-images')){
     if(method==='DELETE'){
       if(state.flags.cleanupFail || body.prefixes?.some(p=>state.flags.blockedCleanup?.has(p)))return json({message:'network timeout'},503);
       if(state.flags.missingIs404 && (body.prefixes??[]).every(p=>!state.objects.has(p)))return json({message:'Object not found',statusCode:'404'},404);
       for(const key of body.prefixes??[])state.objects.delete(key);if(state.flags.lostStorageDeleteResponse)throw new TypeError('Failed to fetch');return json([]);
     }
     if(state.gate)await state.gate;
     if(state.flags.uploadFail)return json({message:'Bucket not found'},400);
     const key=decodeURIComponent(path.split('/object/product-images/')[1]);
     if(state.objects.has(key))return json({message:'The resource already exists',statusCode:'409'},409);
     state.objects.add(key);if(state.flags.lostUpload)throw new TypeError('Failed to fetch');return json({Key:'ok'});
   }
   if(path.endsWith('/rpc/manage_product_image')){
     if(state.flags.registerFail)return json({message:'permission denied',code:'42501'},403);
     if(state.flags.zeroResult)return json(null);
     const p=body.p_payload;
     const receipt=state.receipts.get(p.operation_id);
     if(receipt){assert.equal(receipt.intent,JSON.stringify(body));return json(receipt.result);}
     const saveReceipt=result=>state.receipts.set(p.operation_id,{intent:JSON.stringify(body),result:JSON.parse(JSON.stringify(result))});
     let row=state.rows.find(r=>r.id===body.p_image_id);
     if(body.p_action==='register'){
       row={id:body.p_image_id,product_id:body.p_product_id,storage_bucket:'product-images',...p,source:'upload',is_primary:false};state.rows.push(row);
       if(p.make_primary){state.rows.forEach(r=>r.is_primary=r.id===row.id);product.image_url=row.storefront_url;}
       if(p.replace_id){const old=state.rows.find(r=>r.id===p.replace_id);state.rows=state.rows.filter(r=>r!==old);state.queue.push({storage_path:old.storage_path});}
       saveReceipt(row);if(state.flags.lostResponse)throw new TypeError('Failed to fetch');
     }else if(!row)return json({message:'image_not_found'},400);
     else if(body.p_action==='alt')row.alt_text=p.alt_text;
     else if(body.p_action==='primary'){state.rows.forEach(r=>r.is_primary=r.id===row.id);product.image_url=row.storefront_url;}
     else if(body.p_action==='delete'){
       state.rows=state.rows.filter(r=>r!==row);if(row.source==='upload')state.queue.push({storage_path:row.storage_path});
       if(row.is_primary){product.image_url=state.rows[0]?.storefront_url??null;if(state.rows[0])state.rows[0].is_primary=true;}
       const result={id:row.id,deleted:true};saveReceipt(result);if(state.flags.lostMutationDeleteResponse)throw new TypeError('Failed to fetch');return json(result);
     }
     saveReceipt(row);return json(row);
   }
   if(path.endsWith('/rpc/retire_product_image_upload')){
     if(state.flags.retireFail)throw new TypeError('Failed to fetch');
     if(state.rows.some(r=>r.storage_path===body.p_path))return json(false);
     state.queue.push({storage_path:body.p_path});return json(true);
   }
   if(path.endsWith('/rpc/claim_product_image_cleanup')){
     const jobs=state.queue.filter(j=>(j.next_due??0)<=state.now && (j.lease_until??0)<=state.now).slice(0,body.p_limit);
     for(const j of jobs){j.claim_id=randomUUID();j.lease_until=state.now+120000;j.next_due=j.lease_until;}
     return json(jobs.map(({storage_path,claim_id})=>({storage_path,claim_id})));
   }
   if(path.endsWith('/product_image_cleanup'))return json(state.queue.slice(0,Number(url.searchParams.get('limit')??state.queue.length)));
   if(path.endsWith('/rpc/complete_product_image_cleanup')){
     if(state.flags.completionFail)throw new TypeError('Failed to fetch');
     const job=state.queue.find(r=>r.storage_path===body.p_path);
     if(!job || job.claim_id!==body.p_claim_id)return json(false);
     if(!body.p_storage_confirmed || state.objects.has(body.p_path) || state.rows.some(r=>r.storage_path===body.p_path)){
       job.lease_until=0;job.next_due=state.now+10000;return json(false);
     }
     state.queue=state.queue.filter(r=>r!==job);return json(true);
   }
   return json({});
 };
 const dom=new JSDOM('<html></html>',{url:'https://shop.example/',runScripts:'dangerously',beforeParse(win){
   Object.assign(win,{fetch:fetchImpl,Headers,Request,Response,TextEncoder,TextDecoder});
   win.createImageBitmap=async()=>({width:408,height:450,close(){}});
   win.HTMLCanvasElement.prototype.getContext=()=>null;
 }});
 dom.window.eval(code); const api=dom.window.imageTest;
 await api.catalog.refreshRemoteCatalog();await api.images.refreshProductImages();
 const prepared=await api.files.prepareProductImage(new dom.window.File([photo],'photo.jpg',{type:'image/jpeg'}));
 const request={productId:product.id,prepared,altText:'جدید',makePrimary:true,replacePrevious:false};
 return {dom,api,state,request};
}
async function test(name,fn){const ctx=await setup();try{await fn(ctx);ok(name);}finally{ctx.dom.window.close();}}
await test('variantless products remain manageable; real bytes accepted; UUID object path',async({api,request})=>{
 assert.equal(api.catalog.getRemoteCatalog().products.length,1);
 assert.equal(api.catalogReaders.getVisibleProducts().length,0);
 assert.equal(api.catalogReaders.getProductById(request.productId),undefined);
 const row=await api.images.uploadProductImage(request);
 assert.match(row.storagePath,/products\/jelly-strawberry\/[0-9a-f-]{36}\.jpg$/);
 assert.equal(api.images.getPrimaryImage(request.productId).id,row.id);
});
await test('pending visible immediately; duplicate operation blocked; reset after completion',async({api,state,request})=>{
 let resolve;state.gate=new Promise(r=>resolve=r);
 const task=api.images.uploadProductImage(request);
 assert.equal(api.images.getProductImageSyncState().pending,1);
 await assert.rejects(api.images.uploadProductImage(request),/عملیات قبلی/);
 resolve();await task;assert.equal(api.images.getProductImageSyncState().pending,0);
});
await test('replacement without promotion refuses before any network write',async({api,state,request})=>{
 const n=state.calls.length;
 await assert.rejects(api.images.uploadProductImage({...request,makePrimary:false,replacePrevious:true}),/باید اصلی/);
 assert.equal(state.calls.length,n);assert.equal(state.rows.length,1);
});
await test('upload failure keeps old primary, sends no metadata write or Storage DELETE',async({api,state,request})=>{
 state.flags.uploadFail=true;await assert.rejects(api.images.uploadProductImage(request));
 assert.equal(state.rows.length,1);assert.ok(state.product.image_url.startsWith('images/'));
 assert.equal(state.calls.filter(c=>c.method==='DELETE').length,0);
});
await test('lost Storage response retries the same path without overwrite or duplicate object',async({api,state,request})=>{
 state.flags.lostUpload=true;await assert.rejects(api.images.uploadProductImage(request));
 assert.equal(state.rows.length,1);assert.equal(state.objects.size,1);
 state.flags.lostUpload=false;await api.images.uploadProductImage(request);
 assert.equal(state.rows.length,2);assert.equal(state.objects.size,1);
});
await test('metadata denial retires verified orphan only; old primary remains',async({api,state,request})=>{
 state.flags.registerFail=true;await assert.rejects(api.images.uploadProductImage(request));
 assert.equal(state.objects.size,0);assert.equal(state.rows.length,1);assert.ok(state.product.image_url.startsWith('images/'));
});
await test('lost registration response is resolved by read-back; live file never deleted',async({api,state,request})=>{
 state.flags.lostResponse=true;const row=await api.images.uploadProductImage(request);
 assert.equal(state.rows.length,2);assert.equal(state.product.image_url,row.storefrontUrl);assert.equal(state.objects.size,1);
 assert.equal(state.calls.filter(c=>c.method==='DELETE').length,0);
});
await test('fully unknown outcome retains bytes; same preview retry does not duplicate upload',async({api,state,request})=>{
 Object.assign(state.flags,{lostResponse:true,readFail:true,retireFail:true});
 await assert.rejects(api.images.uploadProductImage(request));assert.equal(state.objects.size,1);
 assert.ok(api.images.getProductImageSyncState().warning);
 Object.assign(state.flags,{lostResponse:false,readFail:false,retireFail:false});
 await api.images.uploadProductImage(request);assert.equal(state.rows.length,2);
 assert.equal(state.calls.filter(c=>c.path.includes('/storage/')&&c.method==='POST').length,1);
});
await test('cleanup failure is warning not data loss; retry clears durable queue',async({api,state,request})=>{
 const previous=await api.images.uploadProductImage(request);
 const next={...request,prepared:{...request.prepared},replacePrevious:true,replaceImageId:previous.id};
 state.flags.cleanupFail=true;await api.images.uploadProductImage(next);
 assert.equal(state.rows.length,2);assert.equal(state.queue.length,1);assert.ok(api.images.getProductImageSyncState().warning);
 state.flags.cleanupFail=false;state.now+=60000;await api.images.retryImageCleanup();assert.equal(state.queue.length,0);
});
await test('zero-result update never reports success',async({api,state})=>{
 state.flags.zeroResult=true;await assert.rejects(api.images.updateProductImageAlt(api.images.getProductImages()[0],'جدید'));
 assert.ok(api.images.getProductImageSyncState().error);assert.equal(api.images.getProductImageSyncState().pending,0);
});
await test('missing image DELETE returns clear error; no cleanup request',async({api,state})=>{
 await assert.rejects(api.images.deleteProductImage({...api.images.getProductImages()[0],id:'cccccccc-0000-4000-8000-000000000001'}),/پیدا نشد/);
 assert.equal(state.calls.filter(c=>c.method==='DELETE').length,0);
});
await test('empty, spoofed, unsupported and oversized files rejected',async({api,dom})=>{
 const f=(bytes,name,type)=>new dom.window.File([bytes],name,{type});
 for(const file of [f('','a.jpg','image/jpeg'),f('not jpeg','a.jpg','image/jpeg'),f('<svg/>','a.svg','image/svg+xml'),f(new Uint8Array(8*1024*1024+1),'a.jpg','image/jpeg')]) {
   await assert.rejects(api.files.prepareProductImage(file));
 }
 const valid=await api.files.prepareProductImage(f(photo,'a.jpg',''));assert.equal(valid.mime,'image/jpeg');
});
await test('ProductVisual retries when URL changes after previous image failed',async({dom})=>{
 dom.window.renderVisual('https://example.org/old.jpg'); await new Promise(r=>setTimeout(r,25));
 dom.window.document.querySelector('#visual-test img').dispatchEvent(new dom.window.Event('error'));
 await new Promise(r=>setTimeout(r,25));assert.equal(dom.window.document.querySelector('#visual-test img'),null);
 dom.window.renderVisual('https://example.org/new.jpg'); await new Promise(r=>setTimeout(r,25));
 assert.equal(dom.window.document.querySelector('#visual-test img').getAttribute('src'),'https://example.org/new.jpg');
});
console.log(`\n${passed} image service checks passed (mocked network).`);

await test('lost Storage DELETE response then confirmed 404 settles the durable job',async({api,state})=>{
 const path='products/jelly-strawberry/aaaaaaaa-0000-4000-8000-000000000009.jpg';
 state.queue.push({storage_path:path});state.objects.add(path);state.flags.lostStorageDeleteResponse=true;
 assert.ok(await api.gateway.cleanupImageFiles());assert.equal(state.objects.size,0);assert.equal(state.queue.length,1);
 state.flags.lostStorageDeleteResponse=false;state.flags.missingIs404=true;state.now+=60000;
 assert.equal(await api.gateway.cleanupImageFiles(),0);assert.equal(state.queue.length,0);
 const finishes=state.calls.filter(c=>c.path.endsWith('/rpc/complete_product_image_cleanup'));
 assert.equal(finishes[0].body.p_storage_confirmed,false);assert.equal(finishes[1].body.p_storage_confirmed,true);
});
await test('20 failing jobs back off and do not starve healthy job 21',async({api,state})=>{
 state.flags.blockedCleanup=new Set();let healthy;
 for(let n=1;n<=21;n++){
  const path=`products/jelly-strawberry/aaaaaaaa-0000-4000-8000-${String(n).padStart(12,'0')}.jpg`;
  state.queue.push({storage_path:path});state.objects.add(path);
  if(n<=20)state.flags.blockedCleanup.add(path);else healthy=path;
 }
 assert.ok(await api.gateway.cleanupImageFiles());assert.ok(state.objects.has(healthy));
 assert.ok(await api.gateway.cleanupImageFiles());assert.equal(state.objects.has(healthy),false);
 assert.equal(state.queue.length,20);state.flags.blockedCleanup.clear();state.now+=60000;
 assert.equal(await api.gateway.cleanupImageFiles(),0);
});
await test('committed DELETE lost response replays same operation and original CAS after refresh',async({api,state})=>{
 const image=api.images.getPrimaryImage(state.product.id);state.flags.lostMutationDeleteResponse=true;
 await assert.rejects(api.images.deleteProductImage(image,true));assert.equal(state.rows.length,0);
 state.flags.lostMutationDeleteResponse=false;await api.images.deleteProductImage(image,true);
 const calls=state.calls.filter(c=>c.path.endsWith('/rpc/manage_product_image'));
 assert.equal(calls.length,2);assert.deepEqual(calls[0].body,calls[1].body);
 assert.equal(state.receipts.size,1);assert.equal(state.product.image_url,null);
 assert.equal(state.calls.filter(c=>c.method==='DELETE').length,0,'legacy file never physically deleted');
});
await test('raw backend fields never survive in error message, detail, stack or JSON',async({api})=>{
 const marker=['synthetic','backend','diagnostic'].join('-');
 for(const error of [api.gateway.describeImageError('ذخیره',{message:marker,details:marker,hint:marker}),new api.gateway.ProductImageError('پیام امن',marker)]){
  for(const text of [error.message,error.detail,error.stack,JSON.stringify(error)])assert.equal(text.includes(marker),false);
 }
});
await test('whitespace legacy URL remains exact, has one real row and correct primary',async({api,state})=>{
 const raw=' '+state.product.image_url+' ';state.product.image_url=raw;state.rows[0].storefront_url=raw;state.rows[0].storage_path=raw;
 await api.catalog.refreshRemoteCatalog();await api.images.refreshProductImages();
 const gallery=api.images.getImagesForProduct(state.product.id);
 assert.equal(gallery.length,1);assert.equal(gallery[0].isPrimary,true);assert.notEqual(gallery[0].virtual,true);
 assert.equal(gallery[0].storefrontUrl,raw);assert.equal(state.product.image_url,raw);
});
await test('completion transport failure recovers on lease expiry without resurrecting bytes',async({api,state})=>{
 const path='products/jelly-strawberry/aaaaaaaa-0000-4000-8000-000000000019.jpg';
 state.queue.push({storage_path:path});state.objects.add(path);state.flags.completionFail=true;
 assert.ok(await api.gateway.cleanupImageFiles());const first=state.queue[0].claim_id;
 state.flags.completionFail=false;state.now+=120001;state.flags.missingIs404=true;
 assert.equal(await api.gateway.cleanupImageFiles(),0);
 const calls=state.calls.filter(c=>c.path.endsWith('/rpc/complete_product_image_cleanup'));
 assert.notEqual(calls.at(-1).body.p_claim_id,first);
});
await test('unavailable browser intent persistence stops before metadata write',async({api,state,dom})=>{
 const image=api.images.getPrimaryImage(state.product.id);
 dom.window.Storage.prototype.setItem=()=>{throw new Error('quota');};
 await assert.rejects(api.images.setPrimaryProductImage(image),/ثبت ایمن/);
 assert.equal(state.calls.filter(c=>c.path.endsWith('/rpc/manage_product_image')).length,0);
});
console.log(`\n${passed} total image service/regression checks passed (mocked network, NOT hosted Storage).`);
