import ru from './locales/ru.js';
import en from './locales/en.js';
import el from './locales/el.js';
const catalogs={ru,en,el};
export const LANGUAGES=Object.freeze(['ru','en','el']);
const supported=value=>typeof value==='string'&&LANGUAGES.includes(value)?value:null;
export function resolveLanguage(languages=[],override=null){
 const selected=supported(override);if(selected)return selected;
 for(const tag of languages||[]){const candidate=String(tag).toLowerCase().split(/[-_]/)[0];if(supported(candidate))return candidate;}
 return 'en';
}
const browser=typeof document!=='undefined';
let stored=null;
try{if(browser)stored=globalThis.localStorage?.getItem('language');}catch{/* Private browsing may deny storage. */}
let language=browser?resolveLanguage(globalThis.navigator?.languages||[globalThis.navigator?.language],stored):'ru';
export const getLanguage=()=>language;
export const locale=()=>({ru:'ru-RU',en:'en-GB',el:'el-GR'}[language]);
export function setLanguage(value,{persist=true}={}){
 if(!supported(value))return language;
 language=value;
 if(browser)document.documentElement.lang=language;
 if(persist){try{globalThis.localStorage?.setItem('language',language);}catch{/* Selection still works for this session. */}}
 return language;
}
export function t(key,params={}){
 const text=catalogs[language]?.[key]??catalogs.en?.[key]??catalogs.ru?.[key]??key;
 return String(text).replace(/\{([a-zA-Z0-9_]+)\}/g,(match,name)=>params[name]==null?match:String(params[name]));
}
if(browser)document.documentElement.lang=language;
