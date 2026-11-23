import {supabaseAdmin as db} from '@/integrations/supabase/client.server';
import {mailVideo} from './video-review.server';
type UploadFile={videoId:string;name:string;mime:string;size:number;kind:'asset'|'versie';version:number|null};
export async function reserveUpload(file:UploadFile,clientId:string,by:'solyn'|'client'){
 const p=await db.from('video_projects').select('*').eq('id',file.videoId).eq('client_id',clientId).single();if(p.error||!p.data)throw new Error('Video niet gevonden');
 if(by==='client'&&!['concept','assets_klaar','in_productie','ter_review','in_revisie','revisie_gevraagd'].includes(p.data.status))throw new Error('Deze video is al afgerond.');
 if(file.kind==='versie'){if(!file.mime.startsWith('video/')||!file.version)throw new Error('Kies een video en versienummer.');if(file.version===2&&p.data.revisions_used!==1)throw new Error('Versie 2 is voor de aangevraagde revisie.');const existing=await db.from('video_assets').select('id').eq('video_project_id',file.videoId).eq('version',file.version).eq('kind','versie');if(existing.data?.length)throw new Error('Deze versie is al geüpload.');}
 else if(file.version!==null)throw new Error('Materiaal heeft geen versienummer.');
 const path=`${clientId}/${file.videoId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
 const u=await db.from('video_uploads').insert({video_project_id:file.videoId,storage_path:path,mime_type:file.mime,size:file.size,kind:file.kind,version:file.version,uploaded_by:by,caption:file.name}).select('id').single();if(u.error)throw new Error(u.error.message);
 const signed=await db.storage.from('client-videos').createSignedUploadUrl(path);if(signed.error)throw new Error(signed.error.message);
 return {uploadId:u.data.id,path,uploadToken:signed.data.token,storageUrl:import.meta.env.VITE_SUPABASE_URL,publicKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY};
}
export async function completeUpload(uploadId:string,clientId:string|null,by:'solyn'|'client',key:string|undefined,origin:string|undefined){
 const u=await db.from('video_uploads').select('*,video_projects(client_id,title,notify_client,clients(name,contact_email,video_token))').eq('id',uploadId).eq('uploaded_by',by).single();if(u.error||!u.data?.video_projects)throw new Error('Upload niet gevonden');
 if(clientId&&u.data.video_projects.client_id!==clientId)throw new Error('Ongeldige upload');
 const info=await db.storage.from('client-videos').info(u.data.storage_path);if(info.error||Number(info.data?.size)!==u.data.size||info.data?.contentType!==u.data.mime_type)throw new Error('Het bestand is nog niet volledig geüpload of heeft een ander formaat.');
 const result=await db.rpc('video_complete_upload',{_upload:uploadId,_client:clientId as string,_by:by});if(result.error)throw new Error(result.error.message);
 const p=u.data.video_projects,c=p.clients;let mailError:string|null=null;
 if(!u.data.completed_at&&c){const root=(origin||'https://solyn22.lovable.app').replace(/\/$/,'');if(by==='client')mailError=await mailVideo(key,'jason@solynglobal.be',`🎬 Nieuw materiaal van ${c.name}`,`${c.name} stuurde materiaal voor “${p.title}”: ${u.data.caption}`,`${root}/videos?video=${u.data.video_project_id}`,uploadId);else if(u.data.kind==='versie'&&p.notify_client&&c.contact_email)mailError=await mailVideo(key,c.contact_email,'Je video staat klaar om te bekijken',`Dag ${c.name}, je video “${p.title}” staat klaar.`,(await import('./client-requests')).videoLink(c.video_token??'',c.name,u.data.video_project_id),uploadId);}
 return {assetId:result.data,mailError};
}
