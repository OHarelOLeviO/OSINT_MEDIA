import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import sources from '../config/sources.json' with { type: 'json' };
import topics from '../config/topics.json' with { type: 'json' };
import type { Coverage, Dataset, Story } from '../src/lib';

const target = new URL('../data/live.json', import.meta.url);
const parser = new XMLParser({ignoreAttributes:false, processEntities:false, parseTagValue:false});
const digest = (key:string)=>createHash('sha256').update(key).digest('hex').slice(0,20);
const field = (v:any):string=>typeof v==='string' ? v : typeof v?.['#text']==='string' ? v['#text'] : '';
function plain(value:string) {
  const entities:Record<string,string>={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(match,key)=>{
    if(key[0]!=='#') return entities[key] ?? match;
    const point=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
    return point>0 && point<=0x10ffff ? String.fromCodePoint(point):match;
  }).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function canonical(raw:string,base:string) {
  if(!raw.trim()) return;
  try {
    const url=new URL(raw,base);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;
    url.hash='';
    for(const key of [...url.searchParams.keys()]) if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return; }
}
const key = (title:string)=>title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function merge(stories:Story[], item:{title:string;topic:string;coverage:Coverage}) {
  const c=item.coverage;
  const prior=stories.find(s=>s.topic===item.topic && s.coverage.some(x=>x.url===c.url)) ?? stories.find(s=>s.topic===item.topic && key(s.title)===key(item.title) && Math.abs(Date.parse(s.reported)-Date.parse(c.reported))<=72*3600_000);
  if(!prior){
    stories.push({id:digest(item.topic+":"+c.url),title:item.title,topic:item.topic,reported:c.reported,coverage:[c]});
    return;
  }
  if(!prior.coverage.some(x=>x.url===c.url && x.source===c.source))prior.coverage.push(c);
}
async function fetchFeed(source:typeof sources[number]){
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(source.url,{signal:AbortSignal.timeout(12000),headers:{accept:'application/rss+xml, application/atom+xml, text/xml, application/xml', 'user-agent':'Dispatch RSS reader (GitHub Pages)'}});
      if(response.status===429 || response.status===403)return null;
      if(!response.ok)throw Error('HTTP '+response.status);
      const xml=await response.text();
      if(xml.length>4_000_000 || /<!DOCTYPE/i.test(xml) || XMLValidator.validate(xml)!==true)throw Error('Invalid feed XML');
      const feed=parser.parse(xml);
      if(!feed.rss?.channel && !feed.feed) throw Error('Unsupported feed format');
      const entries=feed.rss?.channel?.item ?? feed.feed?.entry ?? [];
      return [entries].flat().slice(0,35).flatMap(e=>{
        const description=plain(field(e.description ?? e.summary));
        const title=plain(field(e.title)) || (description.length>130 ? description.slice(0,127).trimEnd()+"…" : description);
        const date=Date.parse(field(e.pubDate ?? e.published ?? e.updated ?? e['dc:date']));
        const link=[e.link].flat().find(l=>l?.['@_href'] && (!l['@_rel'] || l['@_rel']==='alternate'));
        const url=canonical(link?.['@_href'] ?? field(e.link),source.url);
        if(!title||!Number.isFinite(date)||!url)return [];
        const settings=source as typeof source & {headlineMatch?:string;localMatch?:string;headlineOnly?:boolean};
        if([settings.headlineMatch,settings.localMatch].some(pattern=>pattern && !new RegExp(pattern, "iu").test(title)))return [];
        const excerpt=settings.headlineOnly ? "" : description;
        return [{title,topic:source.topic,coverage:{url,source:source.id,publisher:source.attribution,reported:new Date(date).toISOString(),excerpt:excerpt.length>260?excerpt.slice(0,257).trimEnd()+'…':excerpt}}];
      });
    } catch {
      if(attempt===0)await new Promise(r=>setTimeout(r,800));
    }
  }
  return null;
}
async function refresh(){
  const state=JSON.parse(await readFile(target,'utf8')) as Dataset;
  const active=sources.filter(s=>s.enabled && topics.some(t=>t.enabled&&t.id===s.topic));
  const results=await Promise.all(active.map(fetchFeed));
  const now=new Date().toISOString();
  let successful=0;
  for(const [i,source] of active.entries()){
    const result=results[i];
    console.log(source.id, result===null?'failed':result.length+' usable entries');
    state.feeds[source.id]=result===null?{...state.feeds[source.id],ok:false}:{ok:true,lastSuccess:now};
    if(result===null)continue;
    successful++;
    for(const item of result)merge(state.stories,item);
  }
  if(successful){
    state.refreshed=now;
    const recent=state.stories.filter(s=>Date.parse(now)-Date.parse(s.reported)<=36*3600_000 && topics.some(t=>t.enabled&&t.id===s.topic)).sort((a,b)=>b.reported.localeCompare(a.reported));
    const lead=[...new Map([...recent].reverse().map(s=>[s.topic,s])).values()].sort((a,b)=>b.reported.localeCompare(a.reported));
    const ids=[...new Set([...lead,...recent].map(s=>s.id))].slice(0,5);
    if(ids.length)state.briefs[now.slice(0,10)]=ids;
  }
  const temporary=new URL('./live.next.json',target);
  await writeFile(temporary,JSON.stringify(state,null,2)+'\n');
  await rename(temporary,target);
}
if(!process.env.DISPATCH_TEST) await refresh();
