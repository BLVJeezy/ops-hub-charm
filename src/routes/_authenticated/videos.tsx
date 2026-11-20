import {createFileRoute} from '@tanstack/react-router';
import {useSuspenseQuery} from '@tanstack/react-query';
import {staffVideosQuery} from '@/lib/video-queries';
import {VideoWorkspace} from '@/components/VideoWorkspace';
import {videoHead} from '@/lib/video-review';
export const Route=createFileRoute('/_authenticated/videos')({validateSearch:(input:Record<string,unknown>):{video?:string}=>typeof input['video']==='string'?{video:input['video']}:{},head:()=>videoHead('Video’s · Solyn Ops Center','Beheer video’s, maandelijkse slots, revisies en klantfeedback.'),loader:({context})=>context.queryClient.ensureQueryData(staffVideosQuery()),component:Page});
function Page(){const {data}=useSuspenseQuery(staffVideosQuery());const {video}=Route.useSearch();return <VideoWorkspace bundle={data} {...(video?{initialVideo:video}:{})}/>;}
