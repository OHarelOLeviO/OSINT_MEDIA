import taxonomy from '../config/topics.json';
import sources from '../config/sources.json';
import live from '../data/live.json';
import sample from '../data/sample.json';
export const topics = taxonomy.filter(t=>t.enabled);
export {sources};
export interface Coverage {url:string; publisher:string; source:string; reported:string; excerpt:string; image?:string}
export interface Story {id:string; title:string; topic:string; reported:string; occurred?:string; coverage:Coverage[]}
export interface Dataset {hebrew?:Record<string,string>;refreshed:string|null; stories:Story[]; briefs:Record<string,string[]>; feeds:Record<string,{ok:boolean; lastSuccess?:string}>}
export const isSample = import.meta.env.DEV || import.meta.env.PUBLIC_SAMPLE === '1';
export const data = (isSample ? sample : live) as Dataset;
export const inHebrew = (value:string) => /[א-ת]/u.test(value);
const localized=(value:string)=>inHebrew(value)?value:Object.hasOwn(data.hebrew??{},value)?data.hebrew![value]: "";
export const stories = data.stories.map(s=>({...s,title:localized(s.title),coverage:s.coverage.map(c=>({...c,excerpt:localized(c.excerpt)}))})).filter(s=>inHebrew(s.title)&&topics.some(t=>t.id===s.topic)).sort((a,b)=>b.reported.localeCompare(a.reported));
export const url = (path='')=>import.meta.env.BASE_URL.replace(/\/$/,'')+'/'+(path ? path.replace(/\/$/,'')+'/' : '');
export const day = (date:string)=>new Intl.DateTimeFormat('he-IL',{dateStyle:'long',timeZone:'UTC'}).format(new Date(date));
export const stamp = (date:string)=>new Intl.DateTimeFormat('he-IL',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(date))+' UTC';
export const topicName = (id:string)=>topics.find(t=>t.id===id)?.name ?? id;
export const summary = (s:Story)=>s.coverage[0]?.excerpt || 'כותרת בלבד. לפרטים נוספים פתחו את המקור.';

export const editions = [{id:"global",name:"עולמי"},{id:"israel",name:"ישראל"}] as const;
export const sourceEdition = (id:string) => (sources.find(s=>s.id===id) as {edition?:string}|undefined)?.edition ?? "global";
export const storyEditions = (s:Story) => [...new Set(s.coverage.map(c=>sourceEdition(c.source)))];


export const sourcePlatform = (id:string) => (sources.find(s=>s.id===id) as {platform?:string}|undefined)?.platform;
export const mainIdea = (s:Story) => {
  const excerpt=s.coverage[0]?.excerpt;
  if(!excerpt || (inHebrew(s.title) && !inHebrew(excerpt))) return '';
  if(excerpt===s.title) return '';
  const first=new Intl.Segmenter(inHebrew(s.title)?'he':'en',{granularity:'sentence'}).segment(excerpt)[Symbol.iterator]().next().value?.segment.trim() ?? excerpt;
  return first===s.title ? '' : first;
};

export const editionStories=(date:string)=>{const ids=new Set(data.briefs[date]??[]);const selected=stories.filter(s=>ids.has(s.id));const daily=stories.filter(s=>s.reported.startsWith(date));return [...new Set([...selected,...daily])].slice(0,5);};
