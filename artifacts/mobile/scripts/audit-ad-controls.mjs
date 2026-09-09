/** Renders the actual RN card with a test SDK; no live ad requests or clicks. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { launchOptions } from '../../app/scripts/chromium.mjs';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const mobile = join(repo, 'artifacts/mobile');
const requireApi = createRequire(join(repo, 'artifacts/api-server/package.json'));
const requireApp = createRequire(join(repo, 'artifacts/app/package.json'));
const { build } = requireApi('esbuild');
const { chromium } = requireApp('playwright-core');
const temporary = mkdtempSync(join(tmpdir(), 'casparel-ad-controls-'));
const mocks = {
  '@/contexts/AdsContext': `import React from 'react';export const Context=React.createContext(null); export const useAds=()=>React.useContext(Context);`,
  '@/contexts/LanguageContext': `import TR from '${mobile}/lib/i18n/tr.ts';export const useLanguage=()=>({t:key=>new URL(location.href).searchParams.has('tr')?(TR[key]||key):key});`,
  '@/utils/revenuecat-ads': `export const trackSponsoredAdDisplayed=()=>{},trackSponsoredAdFailed=()=>{},trackSponsoredAdLoaded=()=>{},trackSponsoredAdOpened=()=>{},trackSponsoredAdRevenue=()=>{};`,
  '@/utils/ad-diagnostics': `export const ADMOB_NO_FILL_CODE=3,logAdDiagnostic=()=>{};`,
  '@expo/vector-icons': `import React from 'react';import {Text} from 'react-native';export const Feather=({name})=>React.createElement(Text,null,name==='x'?'×':name==='volume-x'?'🔇':'🔊');`,
  '@/utils/google-mobile-ads': `import React from 'react';import {View,Text} from 'react-native';
    window.testAds=[];
    const ads={
      NativeAd:{createForAdRequest:async(unit,options)=>{
        const listeners={};const ad={responseId:String(window.testAds.length+1),headline:'A resource for curious learners',advertiser:'Test sponsor',body:'Explore a new topic at your own pace.',callToAction:'Learn more',mediaContent:{hasVideoContent:true},muted:options.startVideoMuted,destroyed:false,emit:event=>listeners[event]?.(),addAdEventListener:(event,callback)=>{listeners[event]=callback},destroy:()=>{ad.destroyed=true}};
        window.testAds.push(ad);return ad;
      }},
      NativeAdView:({nativeAd,children})=>{React.useEffect(()=>{nativeAd.emit('played')},[nativeAd]);return React.createElement(View,{testID:'sdk-ad-view','dataSet':{response:nativeAd.responseId}},children)},
      NativeAsset:({children})=>children,
      NativeMediaView:({style})=>React.createElement(View,{style:[style,{backgroundColor:'#d9e2ff'}]},React.createElement(Text,null,'Test video — SDK playback controls')),
      NativeAssetType:{},NativeMediaAspectRatio:{LANDSCAPE:2},TestIds:{NATIVE:'test-unit'},
      NativeAdEventType:{IMPRESSION:'impression',CLICKED:'click',PAID:'paid',VIDEO_PLAYED:'played',VIDEO_MUTED:'muted',VIDEO_UNMUTED:'unmuted',VIDEO_ENDED:'ended'}
    };export const loadGoogleMobileAds=async()=>ads;`,
};
try {
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {Context} from '@/contexts/AdsContext';import {SponsoredLearningResourceCard as Card} from '${mobile}/components/SponsoredLearningResourceCard.android.tsx';
    function App(){const [soundMuted,setSoundMuted]=React.useState(false);const [visible,setVisible]=React.useState(true);window.setAdVisible=setVisible;React.useEffect(()=>{window.committedAdVisible=visible},[visible]);return <Context.Provider value={{ready:true,canRequestAds:true,soundMuted,setSoundMuted}}><button id="settings-mute" onClick={()=>setSoundMuted(true)}>Mute in Settings</button><output id="saved-mute">{String(soundMuted)}</output><Card visible={visible}/></Context.Provider>};createRoot(document.getElementById('root')).render(<App/>);`, loader: 'tsx', resolveDir: mobile }, bundle: true, outfile: join(temporary, 'bundle.js'), platform: 'browser', format: 'iife', define: {'process.env.NODE_ENV':'"production"', '__DEV__':'true', 'process.env.EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_NATIVE_AD_UNIT_ID':'"test-unit"'}, nodePaths: [join(mobile,'node_modules')], alias: {'react-native': join(mobile,'node_modules/react-native-web')}, plugins: [{ name: 'test-ad-sdk', setup(builder) {
    builder.onResolve({filter:/.*/}, args=>mocks[args.path] ? {path:args.path,namespace:'mock'} : args.path==='@/utils/ad-rotation' ? {path:join(mobile,'utils/ad-rotation.ts')} : undefined);
    builder.onLoad({filter:/.*/,namespace:'mock'}, args=>({contents:mocks[args.path],loader:'js',resolveDir:mobile}));
  }}] });
  const server = createServer((req,res)=>{res.setHeader('content-type',req.url==='/bundle.js'?'application/javascript':'text/html');res.end(req.url==='/bundle.js'?readFileSync(join(temporary,'bundle.js')):'<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:8px}</style><div id="root"></div><script src="/bundle.js"></script></html>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch(launchOptions());
  try {
    for (const width of [320,390]) {
      const page = await browser.newPage({viewport:{width,height:844}});
      const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(()=>window.testAds.length===2, null, {timeout:5000}).catch(async error => {
        console.error(await page.evaluate(()=>({count:window.testAds?.length,body:document.body.innerText})));throw error;
      });
      await page.screenshot({path:join(tmpdir(), `casparel-ad-controls-${width}.png`),fullPage:true});
      const mute=page.getByRole('button',{name:'Mute ads',exact:true});
      assert.equal(await mute.evaluate(element=>Boolean(element.closest('[data-testid="sdk-ad-view"]'))),false,'app controls must be outside the SDK touch surface');
      assert.ok((await mute.boundingBox()).height>=44);
      await mute.click();
      await page.waitForFunction(()=>document.querySelector('#saved-mute').textContent==='true' && window.testAds[0].destroyed && window.testAds[1].destroyed && window.testAds.length===4);
      assert.equal(await page.evaluate(()=>window.testAds[2].muted),true);
      await page.getByRole('button',{name:'Close this ad and show the next'}).click();
      await page.waitForFunction(()=>window.testAds[2].destroyed);
      assert.equal(await page.locator('[data-testid="sdk-ad-view"]').getAttribute('data-response'),'4');
      await page.evaluate(()=>window.testAds[3].emit('ended'));
      await page.waitForFunction(()=>window.testAds[3].destroyed);
      assert.equal(await page.locator('[data-testid="sdk-ad-view"]').getAttribute('data-response'),'5');
      // A real video mute callback updates Settings and following inventory.
      await page.evaluate(()=>window.testAds[4].emit('unmuted'));
      await page.waitForFunction(()=>document.querySelector('#saved-mute').textContent==='false');
      await page.locator('#settings-mute').click();
      await page.waitForFunction(()=>window.testAds[4].destroyed);
      await page.evaluate(()=>window.setAdVisible(false));
      // State setters return before React commits the visibility prop/effects.
      await page.waitForFunction(()=>window.committedAdVisible===false);
      const current=await page.locator('[data-testid="sdk-ad-view"]').getAttribute('data-response');
      await page.evaluate(id=>window.testAds[Number(id)-1].emit('ended'),current);
      assert.equal(await page.locator('[data-testid="sdk-ad-view"]').getAttribute('data-response'),current);
      await page.evaluate(()=>window.setAdVisible(true));
      await page.waitForFunction(id=>document.querySelector('[data-testid="sdk-ad-view"]').getAttribute('data-response')!==id,current);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'controls and copy must fit narrow screens');
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}px actual native card: reachable controls, mute and Settings sync, skip/end replacement, hidden lifecycle, no overflow`);
      await page.close();
    }
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
} finally { rmSync(temporary,{recursive:true,force:true}); }
