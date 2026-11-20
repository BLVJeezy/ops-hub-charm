import {useState,useRef} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {Upload,PauseCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {prepareVideoUpload,prepareStaffVideoUpload,finishVideoUpload,finishStaffVideoUpload} from '@/lib/video-review.functions';
import {uploadVideoFile,VIDEO_FILE_ACCEPT} from '@/lib/video-upload';
import {toast} from 'sonner';
export function VideoUpload({videoId,token,version=null,onDone,label='Stuur ons materiaal',onAsset}:{videoId:string;token?:string;version?:number|null;onDone:()=>void;label?:string;onAsset?:(id:string)=>void}){
 const prepare=useServerFn(prepareVideoUpload),staffPrepare=useServerFn(prepareStaffVideoUpload),finish=useServerFn(finishVideoUpload),staffFinish=useServerFn(finishStaffVideoUpload);
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[name,setName]=useState('');const input=useRef<HTMLInputElement>(null);
 async function files(list:FileList|null){if(!list?.length)return;setBusy(true);try{for(const file of Array.from(list)){setName(file.name);setProgress(0);const data={videoId,name:file.name,mime:file.type,size:file.size,kind:version?'versie' as const:'asset' as const,version};const ticket=token?await prepare({data:{...data,token}}):await staffPrepare({data});await uploadVideoFile(file,ticket,setProgress);const result=token?await finish({data:{token,uploadId:ticket.uploadId}}):await staffFinish({data:{uploadId:ticket.uploadId}});if(result.mailError)toast.warning(result.mailError);onAsset?.(result.assetId);}toast.success('Materiaal ontvangen');onDone();}catch(e){toast.error(e instanceof Error?e.message:'Upload mislukt');}finally{setBusy(false);if(input.current)input.current.value='';}}
 return <div className="space-y-2"><input ref={input} type="file" multiple={!version} accept={version?'video/mp4,video/quicktime,video/webm':VIDEO_FILE_ACCEPT} className="sr-only" aria-label={label} onChange={e=>void files(e.target.files)}/><Button variant="outline" className="min-h-12 w-full gap-2" disabled={busy} onClick={()=>input.current?.click()}><Upload className="h-4 w-4"/>{busy?'Uploaden…':label}</Button>{busy&&<div aria-live="polite"><p className="truncate text-xs text-muted-foreground">{name} · {progress}%</p><progress className="video-progress w-full h-2" value={progress} max={100}/><p className="text-xs text-muted-foreground flex gap-1 mt-1"><PauseCircle className="h-3 w-3"/>Houd deze pagina open</p></div>}</div>;
}
