CREATE FUNCTION public.video_staff_status(_video uuid,_status text,_notify boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p public.video_projects; v int; BEGIN
IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'Alleen voor het team'; END IF;
SELECT * INTO p FROM public.video_projects WHERE id=_video FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Video niet gevonden'; END IF;
SELECT max(version) INTO v FROM public.video_assets WHERE video_project_id=p.id AND kind='versie';
IF _status='ter_review' AND (v IS NULL OR (p.revisions_used=1 AND v<>2)) THEN RAISE EXCEPTION 'Upload eerst de juiste reviewversie.'; END IF;
IF _status IN ('in_revisie','revisie_gevraagd') AND p.revisions_used<>1 THEN RAISE EXCEPTION 'Er is nog geen revisie gevraagd.'; END IF;
IF _status IN ('goedgekeurd','afgerond') AND v IS NULL THEN RAISE EXCEPTION 'Upload eerst een versie.'; END IF;
UPDATE public.video_projects SET status=_status,notify_client=_notify,approved_at=CASE WHEN _status IN ('goedgekeurd','afgerond') THEN coalesce(approved_at,now()) ELSE approved_at END WHERE id=p.id;
IF _status IN ('goedgekeurd','afgerond') THEN
INSERT INTO public.client_videos(client_id,month,slot,status,sent_at) VALUES(p.client_id,p.month,p.slot,'verstuurd',now()) ON CONFLICT(client_id,month,slot) DO UPDATE SET status='verstuurd',sent_at=EXCLUDED.sent_at;
UPDATE public.client_tasks SET done_at=now() WHERE id IN (SELECT task_id FROM public.video_feedback WHERE video_project_id=p.id) AND done_at IS NULL;
END IF; END $$;
REVOKE ALL ON FUNCTION public.video_staff_status(uuid,text,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.video_staff_status(uuid,text,boolean) TO authenticated,service_role;
CREATE FUNCTION public.video_complete_upload(_upload uuid,_client uuid,_by text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE u public.video_uploads; p public.video_projects; a uuid; task uuid; c text; BEGIN
SELECT * INTO u FROM public.video_uploads WHERE id=_upload AND uploaded_by=_by FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Upload niet gevonden'; END IF;
SELECT * INTO p FROM public.video_projects WHERE id=u.video_project_id FOR UPDATE;
IF _client IS NOT NULL AND p.client_id<>_client THEN RAISE EXCEPTION 'Ongeldige upload'; END IF;
IF u.completed_at IS NOT NULL THEN SELECT id INTO a FROM public.video_assets WHERE storage_path=u.storage_path; RETURN a; END IF;
IF u.created_at<now()-interval '24 hours' THEN RAISE EXCEPTION 'Upload is verlopen'; END IF;
IF u.kind='versie' THEN
IF _by<>'solyn' OR u.mime_type NOT LIKE 'video/%' THEN RAISE EXCEPTION 'Alleen Solyn uploadt versies'; END IF;
IF (u.version=1 AND p.revisions_used<>0) OR (u.version=2 AND p.revisions_used<>1) THEN RAISE EXCEPTION 'Ongeldige revisieronde'; END IF;
END IF;
INSERT INTO public.video_assets(video_project_id,kind,version,storage_path,mime_type,caption,uploaded_by,sort_order) VALUES(p.id,u.kind,u.version,u.storage_path,u.mime_type,u.caption,_by,(SELECT coalesce(max(sort_order),-1)+1 FROM public.video_assets WHERE video_project_id=p.id)) RETURNING id INTO a;
UPDATE public.video_uploads SET completed_at=now() WHERE id=u.id;
IF u.kind='versie' THEN UPDATE public.video_projects SET status='ter_review' WHERE id=p.id; END IF;
IF _by='client' THEN
SELECT name INTO c FROM public.clients WHERE id=p.client_id;
INSERT INTO public.client_tasks(client_id,title,assignee,due_date) VALUES(p.client_id,'Nieuw materiaal van '||c,'me',(now() AT TIME ZONE 'Europe/Brussels')::date+2) RETURNING id INTO task;
INSERT INTO public.video_events(video_project_id,label) VALUES(p.id,'Nieuw materiaal van klant');
END IF; RETURN a; END $$;
REVOKE ALL ON FUNCTION public.video_complete_upload(uuid,uuid,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.video_complete_upload(uuid,uuid,text) TO service_role;