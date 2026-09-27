-- 선택 입력인 짧은 소개글. 기존 프로필은 빈 소개글로 유지한다.
alter table public.profiles
  add column bio text not null default '' check (char_length(bio) <= 100);

-- 기존 본인 프로필 RLS를 그대로 적용한다. 역할 컬럼 권한은 추가하지 않는다.
grant update (bio) on public.profiles to authenticated;
