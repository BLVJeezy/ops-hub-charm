import {useState} from 'react';
import {Link} from '@tanstack/react-router';
import {useServerFn} from '@tanstack/react-start';
import {useQueryClient} from '@tanstack/react-query';
import {ChevronLeft,ChevronRight,Film,Check} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {Textarea} from '@/components/ui/textarea';
import {ClientVideoUpload} from './ClientVideoUpload';
import {submitVideoFeedback} from '@/lib/video-review.functions';
import {VIDEO_LABELS,type VideoBundle,type VideoAsset,type VideoProject} from '@/lib/video-review';

// Shared with the staff workspace: keep these two presentations unchanged.
export function VideoStatusPill({status}:{status:VideoProject['status']}){return <span className={`video-pill ${status==='ter_review'?'video-review-pulse':status==='goedgekeurd'||status==='afgerond'?'video-approved':''}`}>{VIDEO_LABELS[status]}</span>;}
export function VideoMedia({asset,player,className=''}:{asset:VideoAsset;player?:React.RefObject<HTMLVideoElement|null>;className?:string}){return asset.mime_type.startsWith('video/')?<video ref={player} src={asset.url} poster={asset.thumb_url??undefined} controls playsInline preload="metadata" className={`w-full object-contain ${className}`}/>:<img src={asset.url} alt={asset.caption||'Videomateriaal'} className={`w-full object-contain ${className}`}/>;}

function latestAsset(bundle:VideoBundle,id:string){return bundle.assets.filter(a=>a.video_project_id===id&&a.kind==='versie').sort((a,b)=>(b.version??0)-(a.version??0))[0];}
function plainStatus(p:VideoProject){return p.status==='concept'?'Gepland':['in_revisie','revisie_gevraagd'].includes(p.status)?'We passen je feedback aan':'Wordt gemaakt';}

export function VideoPortal({bundle,token,videoId}:{bundle:VideoBundle;token:string;videoId?:string}){
 const client=bundle.clients[0],query=useQueryClient();
 const reload=()=>{void query.invalidateQueries({queryKey:['video-portal',token]});};
 if(!client)return <main className="video-portal video-client client-video-page">Deze link is niet beschikbaar.</main>;
 const waiting=bundle.projects.filter(p=>p.status==='ter_review'),first=waiting[0];
 const approved=bundle.projects.filter(p=>['goedgekeurd','afgerond'].includes(p.status));
 const upcoming=bundle.projects.filter(p=>!['ter_review','goedgekeurd','afgerond'].includes(p.status));
 const project=bundle.projects.find(p=>p.id===videoId),uploadTarget=upcoming[0]??first;
 function row(p:VideoProject,done=false){const a=latestAsset(bundle,p.id)??bundle.assets.find(a=>a.video_project_id===p.id);return <Link key={p.id} to="/video/$token/$videoId" params={{token,videoId:p.id}} className="client-video-row flex items-center gap-4 py-5 border-b border-border">
  <div className="w-16 h-24 shrink-0 overflow-hidden rounded-lg bg-muted">{a?(a.mime_type.startsWith('video/')?<video src={a.url} poster={a.thumb_url??undefined} muted playsInline preload="metadata" className="w-full h-full object-cover"/>:<img src={a.url} alt="" className="w-full h-full object-cover"/>):<div className="h-full flex items-center justify-center"><Film className="text-muted-foreground"/></div>}</div>
  <div className="min-w-0 flex-1"><h3 className="text-lg font-semibold break-words">{p.title}</h3><p className="mt-2 text-base text-muted-foreground">{done?'Goedgekeurd':plainStatus(p)}</p></div><ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground"/>
 </Link>;}
 return <main className="video-portal video-client min-h-screen"><div className="client-video-page mx-auto max-w-xl">
  {videoId?(project?<ClientVideoDetail key={project.id} bundle={bundle} project={project} token={token} reload={reload}/>:<><h1 className="text-2xl font-semibold">Video niet gevonden</h1><Link to="/video/$token" params={{token}} className="inline-flex items-center gap-2 mt-8"><ChevronLeft/>Terug</Link></>):<>
   <header className="mb-9"><h1 className="text-3xl font-semibold leading-tight break-words">Hoi {client.name} 👋</h1><p className="mt-4 text-lg text-muted-foreground">Hier bekijk je de video's die Solyn voor je maakt.</p></header>
   {first?<Button asChild className="client-video-review-card w-full h-auto py-7 px-6 whitespace-normal justify-between text-left"><Link to="/video/$token/$videoId" params={{token,videoId:first.id}}><span><span className="block text-2xl font-semibold">{waiting.length} nieuwe {waiting.length===1?'video':'video’s'} voor jou</span><span className="block text-lg mt-2 font-normal">Tik om te bekijken</span></span><ChevronRight className="shrink-0"/></Link></Button>:<div className="client-video-all-done rounded-lg px-6 py-7 text-2xl font-semibold">✅ Alles bekeken!</div>}
   {upcoming.length>0&&<section className="mt-10"><h2 className="text-xl font-semibold">Wordt gemaakt</h2><div className="mt-2">{upcoming.map(p=>row(p))}</div></section>}
   {approved.length>0&&<section className="mt-10"><h2 className="text-xl font-semibold">Goedgekeurd · {approved.length}</h2><div className="mt-2">{approved.map(p=>row(p,true))}</div></section>}
   <div className="mt-12"><ClientVideoUpload token={token} {...(uploadTarget?{videoId:uploadTarget.id}:{})} onDone={reload}/></div>
  </>}
  <footer className="mt-12 text-center text-sm text-muted-foreground">Powered by Solyn Global</footer>
 </div></main>;
}

function ClientVideoDetail({bundle,project:p,token,reload}:{bundle:VideoBundle;project:VideoProject;token:string;reload:()=>void}){
 const asset=latestAsset(bundle,p.id),latest=asset?.version??1;
 const waiting=bundle.projects.filter(v=>v.status==='ter_review'),index=waiting.findIndex(v=>v.id===p.id),next=waiting.find(v=>v.id!==p.id);
 const materials=bundle.assets.filter(a=>a.video_project_id===p.id&&a.kind==='asset');
 const [screen,setScreen]=useState<'video'|'feedback'|'confirmed'>('video'),[comment,setComment]=useState(''),[attachments,setAttachments]=useState<string[]>([]),[saving,setSaving]=useState(false),[approved,setApproved]=useState(false),[error,setError]=useState(''),[gallery,setGallery]=useState<VideoAsset|null>(null);
 const send=useServerFn(submitVideoFeedback),review=p.status==='ter_review'&&!!asset;
 async function decide(decision:'goedgekeurd'|'aanpassen'|'extra_betalend'){
  setSaving(true);setError('');
  try{await send({data:{token,videoId:p.id,version:latest,decision,comment,timestamps:[],attachments:attachments.map(asset_id=>({asset_id})),contactName:''}});setApproved(decision==='goedgekeurd');setScreen('confirmed');reload();}
  catch{setError('Dat lukte niet. Probeer het nog eens.');}finally{setSaving(false);}
 }
 const back=<Link to="/video/$token" params={{token}} className="inline-flex items-center gap-1 min-h-12 text-lg"><ChevronLeft className="w-5 h-5"/>Terug</Link>;
 if(screen==='confirmed')return <section role="status" className="client-video-confirm-screen flex flex-col justify-center text-center relative">
  {approved&&<div className="client-video-confetti" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i}/>)}</div>}
  <div className="client-video-success-icon mx-auto mb-7"><Check className="w-12 h-12"/></div>
  <h1 className="text-3xl font-semibold">{approved?'Top, goedgekeurd!':'Doorgestuurd!'}</h1>
  {!approved&&<p className="text-lg text-muted-foreground mt-5">{p.revisions_used?'We sturen je eerst een prijs voor deze extra aanpassing.':'We maken de aanpassing en laten het je weten.'}</p>}
  <Button asChild className="client-video-button mt-10 w-full">{next?<Link to="/video/$token/$videoId" params={{token,videoId:next.id}}>Volgende video ›</Link>:<Link to="/video/$token" params={{token}}>Klaar</Link>}</Button>
 </section>;
 if(screen==='feedback')return <section className="client-video-feedback-screen">
  <Button variant="ghost" className="px-0 text-lg min-h-12" onClick={()=>setScreen('video')} disabled={saving}><ChevronLeft className="w-5 h-5"/>Terug</Button>
  <h1 className="text-3xl font-semibold mt-8">Wat moet er anders?</h1>
  {p.revisions_used===1&&<p className="mt-5 text-lg text-muted-foreground">Je gratis aanpassing is al gebruikt. We sturen je eerst een prijs voor deze extra aanpassing.</p>}
  <form className="mt-7 space-y-6" onSubmit={e=>{e.preventDefault();void decide(p.revisions_used?'extra_betalend':'aanpassen');}}>
   <Textarea aria-label="Wat moet er anders?" required maxLength={4000} placeholder="Schrijf het gewoon zoals je het zou zeggen" className="min-h-64 text-lg p-5 leading-relaxed" value={comment} onChange={e=>setComment(e.target.value)} disabled={saving}/>
   <ClientVideoUpload token={token} videoId={p.id} photoOnly onDone={reload} onAsset={id=>setAttachments(a=>[...a,id])}/>
   <Button type="submit" className="client-video-button w-full" disabled={saving||!comment.trim()}>{saving?'Even versturen…':'Versturen'}</Button>
   {error&&<p role="alert" className="text-destructive">{error}</p>}
  </form>
 </section>;
 return <>
  <nav className="flex items-center justify-between mb-5">{back}{waiting.length>1&&index>=0&&<span className="text-lg text-muted-foreground">{index+1} van {waiting.length}</span>}</nav>
  {asset?<VideoMedia key={asset.id} asset={asset} className="aspect-[9/16] rounded-lg bg-muted"/>:<div className="aspect-[9/16] rounded-lg bg-muted flex items-center justify-center"><p className="text-lg text-muted-foreground">Je video wordt gemaakt.</p></div>}
  <h1 className="text-2xl font-semibold mt-6 break-words">{p.title}</h1>
  {review?<section className="mt-9"><h2 className="text-2xl font-semibold mb-6">Vind je deze video goed?</h2><div className="space-y-4">
   <Button className="client-video-button video-approve-button w-full" disabled={saving} onClick={()=>void decide('goedgekeurd')}>{saving?'Even versturen…':'👍 Ja, perfect'}</Button>
   <Button variant="outline" className="client-video-button w-full" disabled={saving} onClick={()=>setScreen('feedback')}>✏️ Nee, iets aanpassen</Button>
  </div><p className="text-base text-muted-foreground mt-5">{p.revisions_used?'Je gratis aanpassing is al gebruikt':'1 aanpassing is gratis inbegrepen'}</p>{error&&<p role="alert" className="text-destructive mt-4">{error}</p>}</section>:<p className="mt-6 text-lg text-muted-foreground">{['goedgekeurd','afgerond'].includes(p.status)?'✅ Deze video is goedgekeurd.':plainStatus(p)}</p>}
  {materials.length>0&&<details className="mt-10 border-t border-border pt-5"><summary className="text-lg cursor-pointer min-h-12">Wat we gebruikten ▾</summary><div className="flex gap-3 overflow-x-auto py-4">{materials.map(a=><Button key={a.id} variant="ghost" className="p-0 shrink-0 w-28 h-36 overflow-hidden rounded-lg" aria-label={`Open ${a.caption}`} onClick={()=>setGallery(a)}>{a.mime_type.startsWith('video/')?<video src={a.url} muted playsInline preload="metadata" className="w-full h-full object-cover"/>:<img src={a.url} alt={a.caption} className="w-full h-full object-cover"/>}</Button>)}</div></details>}
  <Dialog open={!!gallery} onOpenChange={open=>{if(!open)setGallery(null);}}><DialogContent className="video-portal video-client w-[95vw] max-w-3xl"><DialogTitle>{gallery?.caption||'Foto of video'}</DialogTitle>{gallery&&<VideoMedia asset={gallery} className="max-h-[75dvh]"/>}</DialogContent></Dialog>
 </>;
}
