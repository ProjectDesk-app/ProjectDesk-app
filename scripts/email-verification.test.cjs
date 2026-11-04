const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const mod = {exports:{}};
  const source = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020, jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInThisContext('(function(require,module,exports){'+source+'\n})', {filename:file})(name => Object.hasOwn(mocks,name) ? mocks[name] : require(name),mod,mod.exports);
  return mod.exports.default;
}
function setup({missing=false,expired=false}={}) {
  const calls=[];
  const handler=load('src/pages/api/auth/verify-email.ts',{
    '@/lib/prisma':{prisma:{emailVerification:{
      findUnique:async () => {calls.push('lookup');return missing?null:{userId:1,expiresAt:new Date(expired?'2000-01-01':'2099-01-01')};},
      delete:async () => calls.push('consume'),
    },user:{findUnique:async () => ({id:1,email:'student@example.org'}),update:async () => calls.push('verify')}}},
    '@/lib/blockedEmails':{isEmailBlocked:async () => false},
  });
  const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  return {handler,res,calls};
}
test('link scans using GET or HEAD cannot look up or consume verification tokens',async()=>{
  for(const method of ['GET','HEAD','PUT']){
    const {handler,res,calls}=setup();await handler({method,query:{token:'valid'}},res);
    assert.equal(res.code,405);assert.equal(res.headers.Allow,'POST');assert.deepEqual(calls,[]);
  }
});
test('confirmation POST verifies the email and consumes the token',async()=>{
  const {handler,res,calls}=setup();await handler({method:'POST',body:{token:'valid'}},res);
  assert.equal(res.code,200);assert.deepEqual(calls,['lookup','verify','consume']);assert.equal(res.headers['Cache-Control'],'no-store');
});
test('used and expired links explain how to recover',async()=>{
  for(const options of [{missing:true},{expired:true}]){
    const {handler,res,calls}=setup(options);await handler({method:'POST',body:{token:'valid'}},res);
    assert.equal(res.code,options.missing?404:410);assert.match(res.body.error,/sign.*in/i);assert.equal(calls.includes('verify'),false);
  }
});
test('verification page waits for a button press before posting the token',async()=>{
  let posts=0;const originalFetch=global.fetch;
  global.fetch=async()=>{posts++;return {ok:true,json:async()=>({message:'Email verified'})};};
  try{
    const Page=load('src/pages/verify-email.tsx',{
      'next/router':{useRouter:()=>({isReady:true,query:{token:'valid',feedback:'1'}})},
      react:{useRef:()=>({current:false}),useState:value=>[value,()=>{}]},
      '@/components/Layout':{__esModule:true,default:()=>null},
      'next/link':{__esModule:true,default:()=>null},
    });
    const tree=Page();assert.equal(posts,0);
    function findButton(node){if(!node||typeof node!=='object')return; if(node.type==='button')return node;for(const child of [].concat(node.props?.children||[])){const found=findButton(child);if(found)return found;}}
    const button=findButton(tree);assert.ok(button);assert.equal(button.props.children,'Confirm email address');
    await button.props.onClick();assert.equal(posts,1);
    await button.props.onClick();assert.equal(posts,1);
  }finally{global.fetch=originalFetch;}
});
