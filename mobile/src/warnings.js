import {t,locale,getLanguage} from './i18n.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=value=>value??t('translation.pending');
const present=(flag,value)=>typeof flag==='boolean'?flag:!!value?.trim()&&!/^nil$/i.test(value.trim());
export function warningItems(marine,now=Date.now()/1000){
 const all=marine?.alerts||[];
 const alerts=all.filter(a=>a.msg_type!=='Cancel'&&a.expires>now);
 const replacements=new Set(all.flatMap(a=>String(a.refs||'').split(/\s+/).map(ref=>ref.includes(',')?ref.split(',')[1]:ref).filter(Boolean)));
 const items=alerts.filter(a=>!replacements.has(a.identifier)).sort((a,b)=>(a.onset>now)-(b.onset>now)||(b.level||0)-(a.level||0)||a.onset-b.onset).map(a=>({...a,kind:'weather'}));
 const warning=marine?.warnings;
 if(!items.length&&present(warning?.has_warning,warning?.text))items.push({kind:'department',level:0,description:warning.text});
 const sea=marine?.forecast;
 if(sea&&sea.valid_to>now&&present(sea.has_warning,sea.warnings))items.push({kind:'marine',level:0,description:sea.warnings,onset:sea.valid_from,expires:sea.valid_to});
 return items;
}
export function warningsHTML(items,now=Date.now()/1000){
 if(!items.length)return '';
 const format=stamp=>new Intl.DateTimeFormat(locale(),{timeZone:'Asia/Nicosia',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(stamp*1000));
 const highest=Math.max(...items.map(a=>a.level||0));
 return `<details class="warning-banner warning-level-${highest}"><summary><span aria-hidden="true">⚠</span><span>${esc(t('warnings.title'))} · ${items.length}</span><span class="warning-chevron" aria-hidden="true">⌄</span></summary><div class="warning-body">${items.map(a=>{
  const level=[2,3,4].includes(a.level)?a.level:0;
  const type=t('warnings.type'+a.type);
  const title=a.kind==='weather'?`${t('warnings.level'+level)}: ${type.startsWith('warnings.type')?text(a.event||a.headline):type}`:t('warnings.'+a.kind);
  const period=a.onset&&a.expires?`${format(a.onset)} – ${format(a.expires)} · ${t(a.onset>now?'warnings.upcoming':'warnings.active')}`:'';
  return `<article class="warning-item warning-level-${level}"><h3>${esc(title)}</h3>${period?`<p class="warning-period">${esc(period)}</p>`:''}${a.areas?`<p class="warning-areas">${esc(a.areas)}</p>`:''}<p class="warning-text">${esc(text(a.description))}</p>${a.instruction?`<h4>${esc(t('warnings.advice'))}</h4><p class="warning-text">${esc(a.instruction)}</p>`:''}${a.description_el&&getLanguage()!=='el'?`<details class="warning-original"><summary>${esc(t('warnings.original'))}</summary><p lang="el" class="warning-text">${esc(a.description_el)}</p></details>`:''}</article>`;
 }).join('')}<p class="warning-source">CyDoM · Meteoalarm</p></div></details>`;
}
