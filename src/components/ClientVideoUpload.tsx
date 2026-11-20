import {useRef,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {prepareVideoUpload,finishVideoUpload} from '@/lib/video-review.functions';
import {uploadVideoFile,VIDEO_FILE_ACCEPT} from '@/lib/video-upload';

export function ClientVideoUpload({token,videoId,photoOnly=false,onAsset,onDone}:{token:string;videoId?:string;photoOnly?:boolean;onAsset?:(id:string)=>void;onDone:()=>void}){
 const input=useRef<HTMLInputElement>(null),prepare=useServerFn(prepareVideoUpload),finish=useServerFn(finishVideoUpload);
 const [state,setState]=useState<'idle'|'uploading'|'received'>('idle'),[progress,setProgress]=useState(0),[error,setError]=useState('');
 async function upload(files:FileList|null){
  if(!files?.length||!videoId)return;
  setError('');setState('uploading');
  try{const selected=Array.from(files);for(const [index,file] of selected.entries()){
   const ticket=await prepare({data:{token,videoId,name:file.name,mime:file.type,size:file.size,kind:'asset',version:null}});
   await uploadVideoFile(file,ticket,n=>setProgress(Math.round((index+n/100)/selected.length*100)));
   const result=await finish({data:{token,uploadId:ticket.uploadId}});onAsset?.(result.assetId);
  }setState('received');onDone();}
  catch{setError('Dat lukte niet. Probeer je bestand nog eens te sturen.');setState('idle');}
  finally{if(input.current)input.current.value='';}
 }
 const label=photoOnly?'📎 Foto toevoegen (mag ook niet)':"📷 Foto's of video's sturen";
 return <>
  <input ref={input} type="file" aria-label={label} accept={photoOnly?'image/jpeg,image/png,image/webp,image/heic,image/heif':VIDEO_FILE_ACCEPT} multiple={!photoOnly} className="sr-only" onChange={e=>void upload(e.target.files)}/>
  {state==='idle'&&<Button type="button" variant="outline" disabled={!videoId} onClick={()=>input.current?.click()} className="client-video-button w-full border-dashed whitespace-normal">{label}</Button>}
  {!videoId&&state==='idle'&&<p className="mt-3 text-muted-foreground">Je kunt materiaal sturen zodra je eerste video gepland is.</p>}
  {state!=='idle'&&<section role="status" aria-live="polite" className={photoOnly?'py-5':'client-video-upload-screen video-portal video-client'}>
   <div className="w-full max-w-md mx-auto text-center px-5">
    <span className="text-5xl block mb-6" aria-hidden="true">{state==='received'?'✅':'📷'}</span>
    <h2 className="text-3xl font-semibold">{state==='received'?'Ontvangen!':'Even versturen…'}</h2>
    {state==='uploading'?<><progress aria-label="Upload voortgang" className="video-progress w-full h-3 mt-8" value={progress} max={100}/><p className="mt-4">{progress}%</p></>:<>
     <p className="mt-4 text-muted-foreground">{photoOnly?'Je foto is toegevoegd.':'Bedankt, we hebben je materiaal ontvangen.'}</p>
     <Button type="button" className="client-video-button w-full mt-8" onClick={()=>setState('idle')}>{photoOnly?'Nog een foto toevoegen':'Klaar'}</Button>
    </>}
   </div>
  </section>}
  {error&&<p role="alert" className="text-destructive mt-3">{error}</p>}
 </>;
}