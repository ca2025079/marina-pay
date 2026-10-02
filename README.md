# 마리나 예도 스케줄·일비 앱

결혼식 예식 도우미 스케줄 관리와 일비(영수증) 계산 앱이에요.
GitHub(코드 보관) + Supabase(데이터 저장) + Vercel(인터넷 주소로 공개) 조합으로 동작해요.
모든 과정은 갤럭시 탭 브라우저(크롬)에서 할 수 있어요.

## 파일 구성

| 파일 | 하는 일 |
|---|---|
| index.html | 앱 화면의 뼈대 |
| style.css | 디자인 (글자 크기, 색) |
| app.js | 계산, 스케줄, 영수증, 저장 기능 |
| config.js | Supabase 주소와 키 (직접 채워 넣는 파일) |
| manifest.json, icon-*.png | 홈 화면에 앱처럼 설치되게 하는 파일 |
| supabase/schema.sql | Supabase에 붙여넣을 표·보안 설정 |

---

## 1단계. 기존 Supabase 프로젝트에 마리나 표 만들기

무료 요금제는 프로젝트를 2개까지만 켤 수 있어서, 이미 쓰고 있는 프로젝트 안에 마리나 앱 표를 같이 넣어요.
표 이름이 모두 `marina_` 로 시작해서 기존 앱의 표와 겹치지 않아요.

1. supabase.com 대시보드에서 **기존 프로젝트** 하나를 클릭
2. 왼쪽 메뉴 **SQL Editor** → **New query**
3. `supabase/schema.sql` 내용을 전부 복사해 붙여넣고 **Run**
   - 아래쪽에 `Success` 가 나오면 성공
   - 왼쪽 **Table Editor** 에 `marina_admins`, `marina_staff`, `marina_work_days` 가 보이면 완료

## 2단계. 관리자 계정 준비하기

1. 왼쪽 메뉴 **Authentication** → **Users** 에서 본인 이메일이 이미 있는지 확인
   - 없으면 **Add user** → **Create new user** → 이메일·비밀번호 입력, **Auto Confirm User** 체크
   - 이미 있으면 그 계정을 그대로 써도 돼요 (비밀번호가 기억나지 않으면 새 이메일로 만들기)
2. 다시 **SQL Editor** → New query 에 아래를 붙여넣고 이메일만 바꿔서 **Run**

```sql
insert into public.marina_admins (user_id)
select id from auth.users where email = '본인이메일@example.com';
```

3. 주의: 기존 프로젝트의 다른 앱 설정에 영향을 줄 수 있으니
   Authentication 의 **회원가입 허용(Allow new users to sign up)** 설정은 바꾸지 마세요.
   마리나 앱은 `marina_admins` 에 등록된 계정만 수정할 수 있어서, 누가 가입하더라도 안전해요.

## 3단계. 주소와 키 복사해 두기

1. 프로젝트 화면 위쪽의 **Connect** 버튼, 또는 **Project Settings** → **API Keys**
2. 두 가지를 메모장에 복사
   - **Project URL**: `https://xxxx.supabase.co` 형태
   - **Publishable key** (`sb_publishable_...`) 또는 예전 이름 **anon public** 키
3. 기존 앱에서 이미 쓰고 있는 키와 같은 값이어도 괜찮아요
4. 주의: **secret** 키나 **service_role** 키는 절대 쓰지 마세요

## 4단계. GitHub에 올리기

1. 받은 zip 파일을 **내 파일** 앱에서 압축 풀기
2. github.com → 오른쪽 위 **+** → **New repository**
   - Repository name: `marina-pay`
   - Public 또는 Private 아무거나 → **Create repository**
3. **uploading an existing file** 링크 → 압축 푼 파일들을 전부 선택해 올리기
   (index.html, style.css, app.js, config.js, manifest.json, icon-192.png, icon-512.png, README.md)
   - supabase 폴더는 안 올려도 괜찮아요 (이미 1단계에서 사용)
4. 아래 **Commit changes** 클릭

## 5단계. config.js 에 키 넣기

1. GitHub 저장소에서 `config.js` 클릭 → 오른쪽 위 **연필(Edit)** 아이콘
2. 따옴표 안의 글자를 3단계에서 복사한 값으로 바꾸기

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_KEY: "sb_publishable_xxxxxxxx"
};
```

3. **Commit changes**

## 6단계. Vercel로 인터넷에 공개하기

1. vercel.com → **Continue with GitHub** 로 가입
2. **Add New...** → **Project** → `marina-pay` 옆 **Import**
3. Framework Preset 은 **Other** 그대로 → **Deploy**
4. 1분쯤 뒤 `https://marina-pay-xxxx.vercel.app` 주소가 생겨요

이후 GitHub에서 파일을 고치고 Commit 하면 Vercel이 자동으로 다시 배포해요.

## 7단계. 홈 화면에 앱으로 설치

1. 크롬에서 Vercel 주소 열기
2. 오른쪽 위 **⋮** → **홈 화면에 추가** (또는 **앱 설치**)
3. 아이들에게는 같은 주소를 보내 주면 스케줄을 **보기만** 할 수 있어요

---

## 사용법

1. 오른쪽 위 **관리자 로그인** (2단계에서 만든 이메일·비밀번호)
2. **인원·정산** 탭에서 이름 추가
3. **스케줄** 탭 달력에서 날짜 선택 → 예식 시간 선택 → 근무자 추가
4. 근무자마다 팀장/알바, 시작 시간, 몇 시까지 지정
5. 아래 **영수증 복사**, 달력 아래 **월 스케줄 복사**

## 계산 규칙

- 행사비: 예도비(기본 300,000원) × 실제 예식 수
- 건수: 오전(11~16시)은 첫 예식부터 마지막 예식까지 빈 시간 포함, 17시부터는 다시 1건부터 따로 계산해서 합산
- 알바: 1건 30,000 / 2건 42,000 / 3건 55,000 / 4건 65,000 / 5건 75,000 / 6건 85,000
- 팀장: 40,000 + 10,000 × 건수
- 필요 인원: 예식 2개 이하 2명, 3개 이상 4명 (오전·오후 각각)
- 계: 행사비 − 인건비

급여 금액을 바꾸려면 `app.js` 맨 위의 `ALBA` 줄과 `leaderPay` 줄을 고치면 돼요.

## 알아 두면 좋은 점

- Supabase 무료 요금제는 **일주일 동안 아무도 접속하지 않으면 일시 정지**돼요. (같은 프로젝트를 쓰는 다른 앱이나 마리나 앱 중 하나라도 쓰면 유지돼요)
  데이터는 지워지지 않고, Supabase 대시보드에서 **Restore** 를 누르면 다시 켜져요.
- 지금 설정은 **주소를 아는 사람 누구나 스케줄과 금액을 볼 수 있어요.**
  주소는 아이들에게만 공유하세요.
