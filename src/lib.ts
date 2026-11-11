import taxonomy from '../config/topics.json';
import sources from '../config/sources.json';
import live from '../data/live.json';
import sample from '../data/sample.json';
export const topics = taxonomy.filter(t=>t.enabled);
export {sources};
export interface Coverage {url:string; publisher:string; source:string; reported:string; excerpt:string}
export interface Story {id:string; title:string; topic:string; reported:string; occurred?:string; coverage:Coverage[]}
export interface Dataset {refreshed:string|null; stories:Story[]; briefs:Record<string,string[]>; feeds:Record<string,{ok:boolean; lastSuccess?:string}>}
export const isSample = import.meta.env.DEV || import.meta.env.PUBLIC_SAMPLE === '1';
export const data = (isSample ? sample : live) as Dataset;
export const stories = data.stories.filter(s=>topics.some(t=>t.id===s.topic)).sort((a,b)=>b.reported.localeCompare(a.reported));
export const url = (path='')=>import.meta.env.BASE_URL.replace(/\/$/,'')+'/'+(path ? path.replace(/\/$/,'')+'/' : '');
export const day = (date:string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeZone:'UTC'}).format(new Date(date));
export const stamp = (date:string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(date))+' UTC';
export const topicName = (id:string)=>topics.find(t=>t.id===id)?.name ?? id;
export const summary = (s:Story)=>s.coverage[0]?.excerpt || 'Headline only. See the original report.';

export const editions = [{id:"global",name:"Global"},{id:"israel",name:"Israel"}] as const;
export const sourceEdition = (id:string) => (sources.find(s=>s.id===id) as {edition?:string}|undefined)?.edition ?? "global";
export const storyEditions = (s:Story) => [...new Set(s.coverage.map(c=>sourceEdition(c.source)))];

export const inHebrew = (value:string) => /[א-ת]/u.test(value);
export const sourcePlatform = (id:string) => (sources.find(s=>s.id===id) as {platform?:string}|undefined)?.platform;
export const mainIdea = (s:Story) => {
  const excerpt=s.coverage[0]?.excerpt;
  if(!excerpt || (inHebrew(s.title) && !inHebrew(excerpt))) return '';
  if(excerpt===s.title) return '';
  const first=new Intl.Segmenter(inHebrew(s.title)?'he':'en',{granularity:'sentence'}).segment(excerpt)[Symbol.iterator]().next().value?.segment.trim() ?? excerpt;
  return first===s.title ? '' : first;
};
