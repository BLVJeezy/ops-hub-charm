import {createFileRoute} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {videoPortalQuery} from '@/lib/video-queries';
import {VideoPortal} from '@/components/VideoPortal';
import {videoHead} from '@/lib/video-review';
export const Route=createFileRoute('/video/$token')({head:()=>videoHead('Jouw video studio · Solyn Global','Bekijk en keur je social-media video’s veilig goed.'),loader:({context,params})=>context.queryClient.ensureQueryData(videoPortalQuery(params.token)),component:Page,errorComponent:()=> <main className="video-portal min-h-screen p-6"><h1 className="text-xl font-semibold">Privélink niet beschikbaar</h1><p className="mt-3 text-muted-foreground">Deze link is ongeldig of vernieuwd. Vraag Solyn een nieuwe link.</p></main>});
function Page(){const {token}=Route.useParams();const {data}=useSuspenseQuery(videoPortalQuery(token));return <VideoPortal bundle={data} token={token}/>;}
