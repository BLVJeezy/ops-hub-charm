import {createFileRoute} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {videoPortalQuery} from '@/lib/video-queries';
import {VideoPortal} from '@/components/VideoPortal';
import {videoHead} from '@/lib/video-review';
export const Route=createFileRoute('/video/$token_/$videoId')({head:()=>videoHead('Video review · Solyn Global','Bekijk de laatste versie, geef feedback of keur je video goed.'),loader:({context,params})=>context.queryClient.ensureQueryData(videoPortalQuery(params.token)),component:Page,errorComponent:()=> <main className="video-portal min-h-screen p-6">Deze privélink is ongeldig of vernieuwd. Vraag Solyn een nieuwe link.</main>});
function Page(){const {token,videoId}=Route.useParams();const {data}=useSuspenseQuery(videoPortalQuery(token));return <VideoPortal bundle={data} token={token} videoId={videoId}/>;}
