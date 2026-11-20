import {useQuery,useQueryClient} from '@tanstack/react-query';
import {staffVideosQuery} from '@/lib/video-queries';
import {VideoHubBlock} from './VideoWorkspace';
export function ClientVideoHub({clientId}:{clientId:string}){const {data}=useQuery(staffVideosQuery()),q=useQueryClient();return data?<VideoHubBlock clientId={clientId} bundle={data} reload={()=>{void q.invalidateQueries({queryKey:['staff-videos']});}}/>:null;}
