import {queryOptions} from '@tanstack/react-query';
import {readVideoPortal,readStaffVideos} from './video-review.functions';
export const videoPortalQuery=(token:string)=>queryOptions({queryKey:['video-portal',token],queryFn:()=>readVideoPortal({data:{token}}),staleTime:30000,refetchInterval:45000});
export const staffVideosQuery=()=>queryOptions({queryKey:['staff-videos'],queryFn:()=>readStaffVideos(),staleTime:15000,refetchInterval:30000});
