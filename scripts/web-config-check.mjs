import { loadEnv } from 'vite';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const issues = [];
const url = env.VITE_SUPABASE_URL || '';
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

if (!url) {
  issues.push('VITE_SUPABASE_URL을 Netlify 환경 변수에 입력해주세요.');
} else {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error();
  } catch {
    issues.push('VITE_SUPABASE_URL에는 https://로 시작하는 Supabase 프로젝트 기본 주소를 입력해주세요.');
  }
}

if (!key) {
  issues.push('VITE_SUPABASE_PUBLISHABLE_KEY에 프로젝트의 공개 키를 입력해주세요.');
} else if (key.startsWith('sb_secret_')) {
  issues.push('Supabase secret 키는 웹 화면에서 사용할 수 없습니다. 공개 publishable 키로 바꿔주세요.');
} else if (key.startsWith('eyJ')) {
  try {
    if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon') throw new Error();
  } catch {
    issues.push('legacy 키를 사용한다면 anon 키여야 합니다. service_role 키는 사용할 수 없습니다.');
  }
} else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
  issues.push('공개 publishable 키 형식을 확인해주세요.');
}

if (env.VITE_ENABLE_PREVIEW !== 'false') {
  issues.push('서버 연결용 배포에서는 VITE_ENABLE_PREVIEW=false로 설정해주세요.');
}

if (issues.length) {
  console.error('서버 연결용 웹 빌드를 중단합니다.\n- ' + issues.join('\n- '));
  process.exit(1);
}

console.log('웹 연결 설정 형식 확인 완료. 실제 로그인·DB 권한·저장 성공은 별도 확인이 필요합니다.');
