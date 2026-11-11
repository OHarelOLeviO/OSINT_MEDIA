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
  raw=raw.replace(/&amp;/gi,'&');
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
function matchingHeadline(a:string,b:string){
  if(key(a)===key(b))return true;
  const words=(value:string)=>new Set(key(value).split(' ').filter(w=>w.length>=3));
  const first=words(a),second=words(b);
  const common=[...first].filter(w=>second.has(w)).length;
  return common>=6 && common/Math.max(first.size,second.size)>=0.88;
}
export function merge(stories:Story[], item:{title:string;topic:string;coverage:Coverage}, original?:Story):Story {
  const c=item.coverage;
  const prior=stories.find(s=>s.topic===item.topic && s.coverage.some(x=>x.url===c.url)) ?? stories.find(s=>s.topic===item.topic && matchingHeadline(s.title,item.title) && Math.abs(Date.parse(s.reported)-Date.parse(c.reported))<=72*3600_000);
  if(!prior){
    const story=original ?? {id:digest(item.topic+":"+c.url),title:item.title,topic:item.topic,reported:c.reported,coverage:[c]};
    stories.push(story);
    return story;
  }
  const previous=prior.coverage.find(x=>x.url===c.url&&x.source===c.source);
  if(!previous)prior.coverage.push(c);
  else if(c.image)previous.image=c.image;
  return prior;
}
async function fetchFeed(source:typeof sources[number]){
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(source.url,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json, application/rss+xml, application/atom+xml, text/xml, application/xml', 'user-agent':'Dispatch RSS reader (GitHub Pages)'}});
      if(response.status===429 || response.status===403)return null;
      if(!response.ok)throw Error('HTTP '+response.status);
      const xml=await response.text();
      if(xml.length>4_000_000)throw Error('Feed too large');
      let entries;
      if(source.method==='WordPress API'){
        const posts=JSON.parse(xml);
        if(!Array.isArray(posts))throw Error('Invalid WordPress feed');
        entries=posts.map(post=>({title:post.title?.rendered,link:post.link,published:typeof post.date_gmt==='string'?post.date_gmt+'Z':undefined}));
      }else{
        if(/<!DOCTYPE/i.test(xml) || XMLValidator.validate(xml)!==true)throw Error('Invalid feed XML');
        const feed=parser.parse(xml);
        if(feed.urlset){
          entries=[feed.urlset.url??[]].flat().map(row=>({title:row['news:news']?.['news:title'],link:row.loc,published:row['news:news']?.['news:publication_date']}));
        }else{
          if(!feed.rss?.channel && !feed.feed)throw Error('Unsupported feed format');
          entries=feed.rss?.channel?.item ?? feed.feed?.entry ?? [];
        }
      }
      return [entries].flat().slice(0,250).flatMap(e=>{
        const description=plain(field(e.description ?? e.summary));
        const title=plain(field(e.title)) || (description.length>130 ? description.slice(0,127).trimEnd()+"…" : description);
        const date=Date.parse(field(e.pubDate ?? e.published ?? e.updated ?? e['dc:date']));
        const link=[e.link].flat().find(l=>l?.['@_href'] && (!l['@_rel'] || l['@_rel']==='alternate'));
        const url=canonical(link?.['@_href'] ?? field(e.link),source.url);
        if(!title||!Number.isFinite(date)||!url)return [];
        const allowedHost=(source as {articleHost?:string}).articleHost;
        if(allowedHost){
          const article=new URL(url);
          if(article.hostname!==allowedHost&&!article.hostname.endsWith('.'+allowedHost))return [];
          if(source.id==='ynet-sport'&&!article.pathname.startsWith('/sport/'))return [];
        }
        const settings=source as typeof source & {headlineMatch?:string;localMatch?:string;headlineOnly?:boolean};
        if([settings.headlineMatch,settings.localMatch].some(pattern=>pattern && !new RegExp(pattern, "iu").test(title)))return [];
        const excerpt=settings.headlineOnly ? "" : description;
        const thumbnail=source.id.startsWith('yt-') ? [e['media:group']?.['media:thumbnail']].flat()[0]?.['@_url'] : undefined;
        const image=typeof thumbnail==='string' && /^https:\/\/i[1-4]?\.ytimg\.com\//.test(thumbnail)?thumbnail:undefined;
        return [{title,topic:source.topic,coverage:{url,source:source.id,publisher:source.attribution,image,reported:new Date(date).toISOString(),excerpt:excerpt.length>260?excerpt.slice(0,257).trimEnd()+'…':excerpt}}];
      }).slice(0,35);
    } catch {
      if(attempt===0)await new Promise(r=>setTimeout(r,800));
    }
  }
  return null;
}
async function translateHebrew(state:Dataset){
  const apiKey=process.env.GOOGLE_TRANSLATE_API_KEY;
  if(!apiKey)return;
  const cache=state.hebrew ??= {};
  const activeTopics=new Set(topics.filter(t=>t.enabled).map(t=>t.id));
  const pending=[...new Set([...state.stories].sort((a,b)=>b.reported.localeCompare(a.reported))
    .filter(s=>activeTopics.has(s.topic)).flatMap(s=>[s.title,...s.coverage.map(c=>c.excerpt)]))]
    .filter(value=>value && !/[א-ת]/u.test(value) && !Object.hasOwn(cache,value)).slice(0,120);
  const endpoint=new URL('https://translation.googleapis.com/language/translate/v2');
  endpoint.searchParams.set('key',apiKey);
  for(let i=0;i<pending.length;i+=16){
    const batch=pending.slice(i,i+16);
    try{
      const result=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:batch,target:'he',format:'text'}),signal:AbortSignal.timeout(12000)});
      if(!result.ok){console.log('Hebrew translation unavailable (HTTP '+result.status+')');return;}
      const translations=(await result.json())?.data?.translations;
      if(!Array.isArray(translations)||translations.length!==batch.length)return;
      for(const [j,entry] of translations.entries()){
        const value=typeof entry?.translatedText==='string'?plain(entry.translatedText):'';
        if(/[א-ת]/u.test(value))Object.defineProperty(cache,batch[j],{value,enumerable:true,configurable:true,writable:true});
      }
    }catch{console.log('Hebrew translation unavailable');return;}
  }
}
async function refresh(){
  const state=JSON.parse(await readFile(target,'utf8')) as Dataset;
  const consolidated:Story[]=[];
  const aliases=new Map<string,string>();
  for(const story of state.stories){
    const [first,...rest]=story.coverage;
    if(!first)continue;
    const target=merge(consolidated,{title:story.title,topic:story.topic,coverage:first},story);
    for(const coverage of rest){
      if(!target.coverage.some(c=>c.url===coverage.url&&c.source===coverage.source))target.coverage.push(coverage);
    }
    aliases.set(story.id,target.id);
  }
  state.stories=consolidated;
  for(const [date,ids] of Object.entries(state.briefs))state.briefs[date]=[...new Set(ids.map(id=>aliases.get(id)??id))];
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
  await translateHebrew(state);
  const temporary=new URL('./live.next.json',target);
  await writeFile(temporary,JSON.stringify(state,null,2)+'\n');
  await rename(temporary,target);
}
if(!process.env.DISPATCH_TEST) await refresh();
