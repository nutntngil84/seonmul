-- 선물 v0.3: 실제 선배 상담. AI/결제/질문횟수 제한 없음.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 16),
  career text not null default '이제 막 시작했어',
  role text not null default 'junior' check (role in ('junior','mentor','admin')),
  created_at timestamptz not null default now()
);
create table public.mentors (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null,
  accepting boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mentor_id uuid references public.profiles(id) on delete set null,
  nickname text not null, career text not null,
  category text not null check(category in ('practice','client','senior','worry')),
  title text not null,
  status text not null default 'waiting' check(status in ('waiting','answered','closed')),
  reuse_consent boolean not null default false,
  reuse_consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index consultations_user on public.consultations(user_id, updated_at desc);
create index consultations_mentor on public.consultations(mentor_id, updated_at desc);
create table public.consultation_messages (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_kind text not null check(author_kind in ('junior','mentor')),
  author_name text not null,
  body text not null check(char_length(body) between 1 and 5000),
  feedback text not null default '' check(char_length(feedback)<=500),
  request_id uuid not null unique,
  consent_version text,
  created_at timestamptz not null default now()
);
create index messages_consultation on public.consultation_messages(consultation_id, created_at);
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  message_id uuid references public.consultation_messages(id) on delete cascade,
  purpose text not null check(purpose in ('consultation_share','knowledge_reuse')),
  version text not null,
  granted boolean not null,
  created_at timestamptz not null default now()
);
create table public.reflections (
  consultation_id uuid primary key references public.consultations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(char_length(body)<=1500),
  updated_at timestamptz not null default now()
);
create table public.favorites (
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(consultation_id,user_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  message_id uuid not null references public.consultation_messages(id) on delete cascade,
  kind text not null check(kind in ('question','answer')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(recipient_id,message_id)
);
create index notifications_recipient on public.notifications(recipient_id,created_at desc);
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check(platform in ('android','ios')),
  token text not null unique,
  updated_at timestamptz not null default now()
);
create table private.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  device_id uuid not null references public.device_tokens(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  claim_id uuid,
  last_error text,
  sent_at timestamptz,
  unique(notification_id,device_id)
);
create table public.knowledge_candidates (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  source_message_id uuid not null unique references public.consultation_messages(id) on delete cascade,
  question text not null default '', answer text not null default '',
  status text not null default 'draft' check(status in ('draft','reviewed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create function private.is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role in ('mentor','admin'));
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create function private.participant(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.consultations where id=cid and (user_id=auth.uid() or (mentor_id=auth.uid() and private.is_staff())));
$$;
create function private.owner(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.consultations where id=cid and user_id=auth.uid());
$$;
create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,nickname) values(new.id, '후배');
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();

alter table public.profiles enable row level security;
alter table public.mentors enable row level security;
alter table public.consultations enable row level security;
alter table public.consultation_messages enable row level security;
alter table public.consents enable row level security;
alter table public.reflections enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;
alter table public.knowledge_candidates enable row level security;
revoke all on public.profiles,public.mentors,public.consultations,public.consultation_messages,public.consents,public.reflections,public.favorites,public.notifications,public.device_tokens,public.knowledge_candidates from anon,authenticated;
grant select on public.profiles,public.mentors,public.consultations,public.consultation_messages,public.consents,public.reflections,public.favorites,public.notifications,public.knowledge_candidates to authenticated;
grant update(nickname,career) on public.profiles to authenticated;
grant insert,update,delete on public.reflections,public.favorites to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy profile_self on public.profiles for select to authenticated using(id=auth.uid());
create policy profile_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy available_mentors on public.mentors for select to authenticated using(accepting or user_id=auth.uid());
create policy consultation_participant on public.consultations for select to authenticated using(user_id=auth.uid() or (mentor_id=auth.uid() and private.is_staff()));
create policy message_participant on public.consultation_messages for select to authenticated using(private.participant(consultation_id));
create policy consent_self on public.consents for select to authenticated using(user_id=auth.uid());
create policy reflection_read on public.reflections for select to authenticated using(user_id=auth.uid());
create policy reflection_insert on public.reflections for insert to authenticated with check(user_id=auth.uid() and private.owner(consultation_id));
create policy reflection_update on public.reflections for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and private.owner(consultation_id));
create policy reflection_delete on public.reflections for delete to authenticated using(user_id=auth.uid());
create policy favorite_read on public.favorites for select to authenticated using(user_id=auth.uid());
create policy favorite_insert on public.favorites for insert to authenticated with check(user_id=auth.uid() and private.participant(consultation_id));
create policy favorite_update on public.favorites for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and private.participant(consultation_id));
create policy favorite_delete on public.favorites for delete to authenticated using(user_id=auth.uid());
create policy notification_self on public.notifications for select to authenticated using(recipient_id=auth.uid());
create policy notification_read on public.notifications for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
create policy knowledge_reviewers on public.knowledge_candidates for select to authenticated using(private.is_admin() or (private.is_staff() and private.participant(consultation_id)));

create function private.notify_message() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.consultations; recipient uuid; nid uuid;
begin
 select * into c from public.consultations where id=new.consultation_id;
 recipient := case when new.author_kind='junior' then c.mentor_id else c.user_id end;
 if recipient is not null then
  insert into public.notifications(recipient_id,consultation_id,message_id,kind)
  values(recipient,c.id,new.id,case when new.author_kind='junior' then 'question' else 'answer' end) returning id into nid;
  insert into private.notification_outbox(notification_id,device_id)
  select nid,id from public.device_tokens where user_id=recipient;
 end if;
 if new.author_kind='mentor' and c.reuse_consent then
  insert into public.knowledge_candidates(consultation_id,source_message_id) values(c.id,new.id);
 end if;
 return new;
end $$;
create trigger consultation_message_created after insert on public.consultation_messages for each row execute function private.notify_message();

create function public.submit_question(p_request_id uuid,p_category text,p_body text,p_share_consent boolean,p_reuse_consent boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); p public.profiles; mid uuid; cid uuid; msgid uuid; prior public.consultation_messages;
begin
 if uid is null then raise exception '로그인이 필요합니다'; end if;
 perform pg_advisory_xact_lock(hashtext(p_request_id::text));
 select * into prior from public.consultation_messages where request_id=p_request_id;
 if found then
  if prior.author_id<>uid then raise exception '요청 권한이 없습니다'; end if;
  return prior.consultation_id;
 end if;
 if p_share_consent is distinct from true then raise exception '공유 내용을 확인하고 동의해주세요'; end if;
 if p_body is null or char_length(btrim(p_body)) not between 1 and 5000 then raise exception '질문은 1~5000자입니다'; end if;
 select * into p from public.profiles where id=uid;
 if not found then raise exception '프로필이 없습니다'; end if;
 select m.user_id into mid from public.mentors m join public.profiles pr on pr.id=m.user_id
 where m.accepting and pr.role in ('mentor','admin') and m.user_id<>uid order by m.created_at,m.user_id limit 1;
 if mid is null then raise exception '현재 상담을 받을 선배가 없습니다. 질문은 전송되지 않았습니다'; end if;
 insert into public.consultations(user_id,mentor_id,nickname,career,category,title,reuse_consent,reuse_consented_at)
 values(uid,mid,p.nickname,p.career,p_category,left(btrim(p_body),60),p_reuse_consent,case when p_reuse_consent then now() end) returning id into cid;
 insert into public.consultation_messages(consultation_id,author_id,author_kind,author_name,body,request_id,consent_version)
 values(cid,uid,'junior',p.nickname,btrim(p_body),p_request_id,'consultation-v1') returning id into msgid;
 insert into public.consents(user_id,consultation_id,message_id,purpose,version,granted) values(uid,cid,msgid,'consultation_share','consultation-v1',true);
 insert into public.consents(user_id,consultation_id,purpose,version,granted) values(uid,cid,'knowledge_reuse','knowledge-v1',p_reuse_consent);
 return cid;
end $$;

create function public.send_consultation_message(p_consultation_id uuid,p_request_id uuid,p_body text,p_share_consent boolean default false,p_feedback text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); c public.consultations; prior public.consultation_messages; mid uuid; kind text; display text;
begin
 if uid is null then raise exception '로그인이 필요합니다'; end if;
 perform pg_advisory_xact_lock(hashtext(p_request_id::text));
 select * into prior from public.consultation_messages where request_id=p_request_id;
 if found then
  if prior.author_id<>uid or prior.consultation_id<>p_consultation_id then raise exception '요청 권한이 없습니다'; end if;
  return prior.id;
 end if;
 select * into c from public.consultations where id=p_consultation_id for update;
 if not found or (uid<>c.user_id and uid is distinct from c.mentor_id) then raise exception '상담 접근 권한이 없습니다'; end if;
 if c.status='closed' then raise exception '종료된 상담입니다'; end if;
 if p_body is null or char_length(btrim(p_body)) not between 1 and 5000 then raise exception '메시지는 1~5000자입니다'; end if;
 if uid=c.user_id then
  if p_share_consent is distinct from true then raise exception '공유 내용을 확인하고 동의해주세요'; end if;
  if c.mentor_id is null then raise exception '담당 선배 재배정이 필요합니다'; end if;
  kind:='junior';display:=c.nickname;p_feedback:='';
 else
  if not private.is_staff() then raise exception '선배 권한이 필요합니다'; end if;
  kind:='mentor';select display_name into display from public.mentors where user_id=uid;
  if display is null then raise exception '선배 프로필 확인이 필요합니다'; end if;
 end if;
 insert into public.consultation_messages(consultation_id,author_id,author_kind,author_name,body,feedback,request_id,consent_version)
 values(c.id,uid,kind,display,btrim(p_body),coalesce(p_feedback,''),p_request_id,case when kind='junior' then 'consultation-v1' end) returning id into mid;
 if kind='junior' then insert into public.consents(user_id,consultation_id,message_id,purpose,version,granted) values(uid,c.id,mid,'consultation_share','consultation-v1',true); end if;
 update public.consultations set status=case when kind='junior' then 'waiting' else 'answered' end,updated_at=now() where id=c.id;
 return mid;
end $$;

create function public.set_reuse_consent(p_consultation_id uuid,p_granted boolean) returns void language plpgsql security definer set search_path='' as $$
declare c public.consultations;
begin
 select * into c from public.consultations where id=p_consultation_id for update;
 if not found or auth.uid() is distinct from c.user_id then raise exception '권한이 없습니다'; end if;
 if p_granted is null then raise exception '동의 여부가 필요합니다'; end if;
 update public.consultations set reuse_consent=p_granted,reuse_consented_at=case when p_granted then now() end where id=c.id;
 insert into public.consents(user_id,consultation_id,purpose,version,granted) values(auth.uid(),c.id,'knowledge_reuse','knowledge-v1',p_granted);
 if not p_granted then delete from public.knowledge_candidates where consultation_id=c.id;
 else insert into public.knowledge_candidates(consultation_id,source_message_id) select c.id,id from public.consultation_messages where consultation_id=c.id and author_kind='mentor' on conflict do nothing;
 end if;
end $$;
create function public.review_knowledge(p_id uuid,p_question text,p_answer text,p_privacy_checked boolean) returns void language plpgsql security definer set search_path='' as $$
declare k public.knowledge_candidates; c public.consultations;
begin
 if not private.is_admin() then raise exception '운영자 검수 권한이 필요합니다'; end if;
 select * into k from public.knowledge_candidates where id=p_id;
 if not found then raise exception '초안이 없습니다'; end if;
 select * into c from public.consultations where id=k.consultation_id for update;
 if not c.reuse_consent then raise exception '재사용 동의가 없습니다'; end if;
 if p_privacy_checked is distinct from true or coalesce(length(btrim(p_question)),0)=0 or coalesce(length(btrim(p_answer)),0)=0 then raise exception '비식별 질문·답변과 검수 확인이 필요합니다'; end if;
 update public.knowledge_candidates set question=left(p_question,5000),answer=left(p_answer,10000),status='reviewed',reviewed_by=auth.uid(),reviewed_at=now() where id=k.id;
end $$;

create function public.register_device(p_token text,p_platform text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_token is null or length(p_token) not between 16 and 4096 then raise exception '올바른 로그인과 기기 토큰이 필요합니다'; end if;
 -- 다른 계정으로 로그인한 기기에 이전 계정의 대기 알림을 보내지 않는다.
 delete from private.notification_outbox where device_id in(select id from public.device_tokens where token=p_token and user_id<>auth.uid());
 insert into public.device_tokens(user_id,token,platform) values(auth.uid(),p_token,p_platform)
 on conflict(token) do update set user_id=auth.uid(),platform=p_platform,updated_at=now();
end $$;
create function public.unregister_device(p_token text) returns void language sql security definer set search_path='' as $$
 delete from public.device_tokens where user_id=auth.uid() and token=p_token;
$$;

create function public.claim_notification_jobs(p_limit integer default 25)
returns table(job_id uuid,claim_id uuid,token text,platform text,notification_id uuid,consultation_id uuid,kind text)
language sql security definer set search_path='' as $$
 with abandoned as (
  update private.notification_outbox set status='failed',last_error='WORKER_LEASE_EXHAUSTED',locked_until=null
  where status='processing' and locked_until<now() and attempts>=8 returning id
 ), picked as (
  select o.id from private.notification_outbox o
  where o.attempts<8 and ((o.status='pending' and o.available_at<=now()) or (o.status='processing' and o.locked_until<now()))
  order by o.available_at for update skip locked limit greatest(1,least(p_limit,50))
 ), claimed as (
  update private.notification_outbox o set status='processing',attempts=o.attempts+1,locked_until=now()+interval '3 minutes',claim_id=gen_random_uuid()
  from picked where o.id=picked.id returning o.*
 ) select c.id,c.claim_id,d.token,d.platform,n.id,n.consultation_id,n.kind from claimed c
 join public.device_tokens d on d.id=c.device_id join public.notifications n on n.id=c.notification_id
 where d.user_id=n.recipient_id;
$$;
create function public.finish_notification_job(p_job_id uuid,p_claim_id uuid,p_ok boolean,p_error text default null,p_invalid_token boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare o private.notification_outbox;
begin
 select * into o from private.notification_outbox where id=p_job_id and claim_id=p_claim_id and status='processing' for update;
 if not found then return; end if;
 if p_invalid_token then delete from public.device_tokens where id=o.device_id; return; end if;
 update private.notification_outbox set status=case when p_ok then 'sent' when attempts>=8 then 'failed' else 'pending' end,
 sent_at=case when p_ok then now() end,last_error=left(p_error,1000),locked_until=null,
 available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)) where id=o.id;
end $$;

-- SECURITY DEFINER functions are explicitly granted; browser cannot run delivery jobs.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.participant(uuid),private.owner(uuid),private.is_staff(),private.is_admin() to authenticated;
revoke all on function public.submit_question(uuid,text,text,boolean,boolean),public.send_consultation_message(uuid,uuid,text,boolean,text),public.set_reuse_consent(uuid,boolean),public.review_knowledge(uuid,text,text,boolean),public.register_device(text,text),public.unregister_device(text),public.claim_notification_jobs(integer),public.finish_notification_job(uuid,uuid,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.submit_question(uuid,text,text,boolean,boolean),public.send_consultation_message(uuid,uuid,text,boolean,text),public.set_reuse_consent(uuid,boolean),public.review_knowledge(uuid,text,text,boolean),public.register_device(text,text),public.unregister_device(text) to authenticated;
grant execute on function public.claim_notification_jobs(integer),public.finish_notification_job(uuid,uuid,boolean,text,boolean) to service_role;
grant all on all tables in schema public to service_role;
grant all on all tables in schema private to service_role;
