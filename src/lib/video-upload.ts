import {Upload} from 'tus-js-client';
type Ticket={uploadId:string;path:string;uploadToken:string;storageUrl:string;publicKey:string};
export async function uploadVideoFile(file:File,ticket:Ticket,progress:(n:number)=>void){
 if(file.size>6*1024*1024){await new Promise<void>((resolve,reject)=>{
 const upload=new Upload(file,{endpoint:`${ticket.storageUrl}/storage/v1/upload/resumable/sign`,headers:{'x-signature':ticket.uploadToken,apikey:ticket.publicKey},retryDelays:[0,1000,3000,5000,10000],chunkSize:6*1024*1024,uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,fingerprint:async()=>`solyn-video-${ticket.uploadId}`,metadata:{bucketName:'client-videos',objectName:ticket.path,contentType:file.type,cacheControl:'3600'},onError:reject,onProgress:(bytes,total)=>progress(Math.round(bytes/total*100)),onSuccess:()=>{progress(100);resolve();}});
 upload.findPreviousUploads().then(previous=>{const first=previous[0];if(first)upload.resumeFromPreviousUpload(first);upload.start();}).catch(reject);
 });return;}
 await new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',`${ticket.storageUrl}/storage/v1/object/upload/sign/client-videos/${ticket.path}?token=${encodeURIComponent(ticket.uploadToken)}`);xhr.setRequestHeader('Content-Type',file.type);xhr.setRequestHeader('apikey',ticket.publicKey);xhr.upload.onprogress=e=>{if(e.lengthComputable)progress(Math.round(e.loaded/e.total*100));};xhr.onerror=()=>reject(new Error('Verbinding verbroken. Probeer opnieuw.'));xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300){progress(100);resolve();}else reject(new Error(`Upload mislukt (${xhr.status}).`));};xhr.send(file);});
}
export const VIDEO_FILE_ACCEPT='image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm';
