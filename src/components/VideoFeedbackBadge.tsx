import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/hooks/use-auth';
export function VideoFeedbackBadge(){const {role}=useAuth();const {data}=useQuery({queryKey:['video-unseen'],enabled:!!role,refetchInterval:30000,queryFn:async()=>{const r=await supabase.from('video_feedback').select('id',{count:'exact',head:true}).is('seen_at',null);if(r.error)throw r.error;return r.count??0;}});return data?<span className="video-pill ml-auto" aria-label={`${data} nieuwe video feedback`}>{data}</span>:null;}
