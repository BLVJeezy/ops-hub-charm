export const VIDEO_STATUSES = ['concept','assets_klaar','in_productie','ter_review','revisie_gevraagd','in_revisie','goedgekeurd','afgerond'] as const;
export const VIDEO_PLATFORMS = ['instagram','tiktok','youtube','facebook'] as const;
export type VideoStatus = typeof VIDEO_STATUSES[number];
export const VIDEO_LABELS: Record<VideoStatus,string> = {concept:'Concept',assets_klaar:'Assets klaar',in_productie:'In productie',ter_review:'Klaar voor jouw review',revisie_gevraagd:'Revisie gevraagd',in_revisie:'Revisie bezig',goedgekeurd:'Goedgekeurd ✓',afgerond:'Afgerond'};
export type VideoClient = {id:string;name:string;contact_name:string|null;contact_phone?:string|null;brand_color:string|null;social_videos_per_month:number|null;video_token?:string|null};
export type VideoProject = {id:string;client_id:string;month:string;slot:number;title:string;brief:string;platform:(typeof VIDEO_PLATFORMS[number])[];due_date:string|null;status:VideoStatus;revisions_included:number;revisions_used:number;notify_client:boolean;approved_at:string|null};
export type VideoAsset = {id:string;video_project_id:string;kind:'asset'|'versie';version:number|null;storage_path:string;mime_type:string;caption:string;sort_order:number;uploaded_by:string;url:string;thumb_url:string|null};
export type VideoFeedback = {id:string;video_project_id:string;version:number;decision:string;comment:string;timestamps:{seconds:number;note:string}[];attachments:{asset_id:string;url?:string}[];contact_name:string;created_at:string;seen_at:string|null;email_error:string|null};
export type VideoEvent = {id:string;video_project_id:string;label:string;created_at:string};
export type VideoBundle = {clients:VideoClient[];projects:VideoProject[];assets:VideoAsset[];feedback:VideoFeedback[];events:VideoEvent[]};
export function momentLabel(seconds:number){const s=Math.floor(Math.max(0,seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
export function nextSlot(projects:Pick<VideoProject,'slot'>[],limit:number){for(let i=1;i<=limit;i++)if(!projects.some(p=>p.slot===i))return i;return null;}
export function portalMonths(projects:Pick<VideoProject,'month'>[],current:string){return [current,...Array.from(new Set(projects.map(p=>p.month))).filter(m=>m!==current).sort().reverse()];}
export function decisionAllowed(status:VideoStatus,version:number,used:number,decision:string){if(status!=='ter_review')return false;if(decision==='goedgekeurd')return true;return decision==='aanpassen'? version===1&&used===0:decision==='extra_betalend'&&version===2&&used===1;}
export function revisionDue(today:string){const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+2);return d.toISOString().slice(0,10);}
export const videoHead=(title:string,description:string)=>({meta:[{title},{name:'description',content:description},{property:'og:title',content:title},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex, nofollow'}]});
