import {supabaseAdmin as db} from '@/integrations/supabase/client.server';
import type {VideoBundle,VideoAsset,VideoFeedback} from './video-review';
export async function tokenClient(token:string){const {data,error}=await db.from('clients').select('id,name,contact_name,contact_email,brand_color,social_videos_per_month').eq('video_token',token).maybeSingle();if(error||!data)throw new Error('Deze privélink is ongeldig of vernieuwd. Vraag Solyn een nieuwe link.');return data;}
export async function bundle(clientId?:string):Promise<VideoBundle>{
 const clientsQ=db.from('clients').select('id,name,contact_name,contact_phone,brand_color,social_videos_per_month,video_token').order('name');
 const projectsQ=db.from('video_projects').select('*').order('month',{ascending:false}).order('slot');
 const [c,p]=await Promise.all([clientId?clientsQ.eq('id',clientId):clientsQ,clientId?projectsQ.eq('client_id',clientId):projectsQ]);
 if(c.error||p.error)throw new Error(c.error?.message||p.error?.message);
 const projects=p.data??[],ids=projects.map(x=>x.id);
 if(!ids.length)return {clients:(c.data??[]).map(x=>clientId?{...x,video_token:null}:x),projects:[],assets:[],feedback:[],events:[]};
 const [a,f,e]=await Promise.all([db.from('video_assets').select('*').in('video_project_id',ids).order('sort_order'),db.from('video_feedback').select('*').in('video_project_id',ids).order('created_at',{ascending:false}),db.from('video_events').select('*').in('video_project_id',ids).order('created_at')]);
 if(a.error||f.error||e.error)throw new Error('Video’s konden niet geladen worden.');
 async function sign(path:string){const r=await db.storage.from('client-videos').createSignedUrl(path,3600);if(r.error)throw new Error('Media konden niet geladen worden.');return r.data.signedUrl;}
 const assets:VideoAsset[]=await Promise.all((a.data??[]).map(async x=>({...x,kind:x.kind as VideoAsset['kind'],url:await sign(x.storage_path),thumb_url:x.thumb_path?await sign(x.thumb_path):null})));
 const feedback=(f.data??[]).map(x=>({...x,...(clientId?{email_error:null,seen_at:null,task_id:null,request_id:null}:{}),attachments:(x.attachments as {asset_id:string}[]).map(y=>({...y,url:assets.find(z=>z.id===y.asset_id)?.url}))})) as unknown as VideoFeedback[];
 return {clients:(c.data??[]).map(x=>clientId?{...x,video_token:null}:x),projects:projects as VideoBundle['projects'],assets,feedback,events:e.data??[]};
}
export async function mailVideo(key:string|undefined,to:string,subject:string,body:string,link:string,eventId:string){
 if(!key)return 'E-mail is niet ingesteld.';
 try {
 const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`video-${eventId}`},body:JSON.stringify({from:'Solyn Global <status@solynglobal.be>',to:[to],reply_to:'jason@solynglobal.be',subject,text:`${body}\n\n${link}`,html:`<div style="font-family:Arial;line-height:1.6"><h2>${esc(subject)}</h2><p style="white-space:pre-wrap">${esc(body)}</p><p><a href="${esc(link)}">Bekijk de video</a></p><p>Jason · Solyn Global</p></div>`})});
 if(!r.ok){const body=await r.text();console.error(`Video email failed [${r.status}]: ${body}`);return `E-mail niet verstuurd (${r.status}).`;}
 return null;
 } catch(error) { console.error('Video notification connection failed',error); return 'Je wijziging is opgeslagen, maar de e-mail kon niet verstuurd worden.'; }
}
