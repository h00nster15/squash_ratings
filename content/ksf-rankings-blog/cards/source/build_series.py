import os
src=open('build.py').read().split("n=len(C)")[0]
exec(src)
def cover(part,title,sub,pts):
    return f'<p class="kick">KOREA SQUASH RANKINGS · PART {part} / 3</p><h1 class="t xl">{title}</h1><p class="sub">{sub}</p><div class="panel">'+''.join(f'<div class="pt"><div class="n">{i+1}</div><div><h4>{h}</h4><p>{p}</p></div></div>' for i,(h,p) in enumerate(pts))+'</div>'
def stats(kick,title,S,fine=''):
    return f'<p class="kick">{kick}</p><h1 class="t">{title}</h1><div class="panel" style="padding-top:4px;padding-bottom:4px">'+''.join(f'<div class="stat"><div><div class="k">{k}</div><div class="v">{v}</div></div><div class="num">{n}<small>{s2}</small></div></div>' for k,v,n,s2 in S)+'</div>'+(f'<p class="fine">{fine}</p>' if fine else '')
def pts(kick,title,P):
    return f'<p class="kick">{kick}</p><h1 class="t">{title}</h1><div class="panel">'+''.join(f'<div class="pt"><div class="n">{i+1}</div><div><h4>{h}</h4><p>{p}</p></div></div>' for i,(h,p) in enumerate(P))+'</div>'
data='''<p class="kick">DATA · 2018 – 2026</p><h1 class="t">어떤 데이터인가요?</h1>
<div class="nums"><div><b>5,054</b><span>개인전 경기</span></div><div><b>741</b><span>선수</span></div><div><b>55</b><span>대회</span></div></div>
<div class="panel">
<div class="krow"><div class="d">기간</div><div class="v">2018년 4월 ~ 2026년 10월</div><div class="r">약 8년</div></div>
<div class="krow"><div class="d">범위</div><div class="v">전국 대회 + 전국체전</div><div class="r">개인전만</div></div>
<div class="krow"><div class="d">제외</div><div class="v">단체전 · 복식 · 기권</div><div class="r" style="visibility:hidden">–</div></div>
<div class="krow"><div class="d">정리</div><div class="v">중복 등록번호 통합 · 오류 스코어 제외</div><div class="r" style="visibility:hidden">–</div></div>
</div><p class="fine">2022년 41경기 → 2024·2025년 각 1,000경기 이상. 대회가 다시 늘고 있습니다</p>'''
P1=[cover(1,'한국 스쿼시 랭킹,<br>직접 만들었습니다','8년치 경기 결과로 만든 랭킹 · 데이터와 계산 원리',[('8년치 경기 기록을 전부 모았습니다','2018년 4월 ~ 2026년 10월 전국체전'),('누구를, 몇 대 몇으로 이겼는지 봅니다','강한 상대를 이길수록 많이 오릅니다'),('순위 높은 선수가 이길 확률 78%','연맹 포인트 순위보다 잘 맞았습니다')]),
 data,
 pts('HOW IT WORKS','어떻게 계산하나요?',[('누구를 이겼는지','강한 상대를 이기면 많이 오르고, 약한 상대에게 지면 크게 떨어집니다'),('몇 대 몇인지','3:0 완승과 3:2 신승은 다르게, 5게임제는 더 무겁게 반영'),('최근 3년만','오래 쉬면 감점, 최근 1년 출전 선수만 랭킹에 표시'),('일반부와 학생부는 따로','학생부 성적이 일반부 실력으로 읽히지 않게 분리')]),
 C[6].split('<div class="panel">\n<div class="pt">')[0].__add__('<p class="close">10경기 중 8경기는<br><em>순위가 높은 선수가 이겼습니다</em></p><p class="fine">최근 3년 경기만 반영 · 일반부와 학생부는 따로 계산 · 자세한 내용은 블로그에서</p>').replace('<p class="fine">최근 3년 경기만 반영 · 일반부와 학생부는 따로 계산 · 자세한 내용은 블로그에서</p>','<p class="fine">다음 편: 전국체전까지 반영한 현재 랭킹 공개</p>')]
P2=[cover(2,'지금 한국<br>스쿼시 랭킹','2026 전국체전까지 반영 · 최근 1년 출전 선수 기준',[('남자 일반부 1, 2위는 단 29점 차','전국체전 결승이 순위를 흔들었습니다'),('역대 최고점이 3개 나왔습니다','남자 일반부 · 여자 일반부 · 학생부 모두 10월에 경신'),('이민우 vs 나주영','맞대결은 나주영이 4승 3패로 앞섭니다')]),C[1],C[2],C[3],C[4]]
P3=[cover(3,'8년치<br>기록실','2018 – 2026 개인전 5,054경기에서 찾은 기록',[('최다승과 승률 1위는 같은 선수','통산 125승 10패'),('가장 많이 만난 두 선수는 13번','그것도 7승 6패'),('승부의 67%는 3:0','일반부는 57%로 더 팽팽합니다')]),
 C[5],
 stats('WIN RATE · 2018 – 2026','승률 TOP',[('일반부 승률 1위 (20경기 이상)','이민우','91.4%','74승 7패'),('일반부 승률 2위','나주영','88.9%','32승 4패'),('일반부 승률 3위','엄화영','84.9%','62승 11패'),('통산 승률 1위 (50경기 이상)','이민우','92.6%','125승 10패'),('통산 승률 2위','김찬영','89.2%','58승 7패')],'통산 = 일반부 + 학생부 개인전 전체'),
 stats('HEAD TO HEAD · 2018 – 2026','가장 많이 만난 라이벌',[('13번 · 가장 팽팽한 사이','오서진 vs 나주영','6 – 7','나주영 우세'),('11번','오서진 vs 류정욱','8 – 3','오서진 우세'),('11번','이민우 vs 류정민','11 – 0','이민우 전승'),('11번','이민우 vs 강우석','9 – 2','이민우 우세')],'5게임제 승부의 67%는 3:0 · 풀게임(3:2)은 11%뿐')]

import json
T=json.load(open('top20.json'))
extra+="""
  .rk.c{padding:11px 0;grid-template-columns:54px 1fr auto auto;gap:14px}
  .rk.c .n{font-size:30px} .rk.c .nm{font-size:31px;display:flex;align-items:baseline;gap:14px} .rk.c .nm small{display:inline;font-size:20px;margin:0}
  .rk.c .pt2{font-size:32px} .rk.c .rec{font:500 20px var(--f);color:var(--muted);width:120px;text-align:right}
  .rk.m{padding:10px 0;grid-template-columns:40px 1fr auto;gap:10px}
  .rk.m .n{font-size:25px} .rk.m .nm{font-size:27px} .rk.m .pt2{font-size:27px}
  .rk.t{padding:15px 0;grid-template-columns:40px 1fr auto;gap:12px} .rk.t .n{font-size:30px} .rk.t .nm{font-size:32px} .rk.t .nm small{font-size:18px} .rk.t .pt2{font-size:32px}
"""
def ten(kick,sexc,sexl,title,rows,fine):
    body=''.join(f'<div class="rk c{" top" if n==1 else ""}"><div class="n">{n}</div><div class="nm">{a}<small>{t}</small></div><div class="rec">{w}승 {l}패</div><div class="pt2">{p}</div></div>' for n,a,t,p,w,l,_ in rows)
    return f'<p class="kick">{kick}</p><h1 class="t" style="display:flex;gap:16px;align-items:center"><span class="sq {sexc}">{sexl}</span>{title}</h1><div class="panel" style="margin-top:20px;padding-top:2px;padding-bottom:2px">{body}</div><p class="fine">{fine}</p>'
def twenty(kick,sexc,sexl,title,rows,fine):
    col=lambda rs:''.join(f'<div class="rk m{" top" if n==1 else ""}"><div class="n">{n}</div><div class="nm">{a}</div><div class="pt2">{p}</div></div>' for n,a,t,p,*_ in rs)
    return f'<p class="kick">{kick}</p><h1 class="t" style="display:flex;gap:16px;align-items:center"><span class="sq {sexc}">{sexl}</span>{title}</h1><div class="two" style="margin-top:20px"><div class="panel" style="padding:2px 22px">{col(rows[:10])}</div><div class="panel" style="padding:2px 22px">{col(rows[10:])}</div></div><p class="fine">{fine}</p>'
F='최근 1년 내 출전 선수 기준 · 최근 3년 전적'
teaser='<p class="kick">PREVIEW · PART 2</p><h1 class="t">미리보기: 일반부 TOP 5</h1><div class="two"><div class="panel"><h3><span class="sq him">남</span>남자</h3>'+''.join(f'<div class="rk t{" top" if n==1 else ""}"><div class="n">{n}</div><div class="nm">{a}<small>{t}</small></div><div class="pt2">{p}</div></div>' for n,a,t,p,*_ in T['open남자'][:5])+'</div><div class="panel"><h3><span class="sq her">여</span>여자</h3>'+''.join(f'<div class="rk t{" top" if n==1 else ""}"><div class="n">{n}</div><div class="nm">{a}<small>{t}</small></div><div class="pt2">{p}</div></div>' for n,a,t,p,*_ in T['open여자'][:5])+'</div></div><p class="close">남자 1, 2위는 단 29점 차.<br><em>TOP 20 전체는 다음 편에서 공개합니다</em></p>'
P1[3]=P1[3].replace('<p class="fine">다음 편: 전국체전까지 반영한 현재 랭킹 공개</p>','')
P1.append(teaser)
P2=[cover(2,'지금 한국<br>스쿼시 랭킹 TOP 20','2026 전국체전까지 반영 · 최근 1년 출전 선수 기준',[('남자 일반부 1, 2위는 단 29점 차','전국체전 결승이 순위를 흔들었습니다'),('역대 최고점이 3개 나왔습니다','남자 일반부 · 여자 일반부 · 학생부 모두 10월에 경신'),('이민우 vs 나주영','맞대결은 나주영이 4승 3패로 앞섭니다')]),
 ten('국가 랭킹 · 일반부','him','남','남자 1 – 10위',T['open남자'][:10],F),ten('국가 랭킹 · 일반부','him','남','남자 11 – 20위',T['open남자'][10:],F),
 ten('국가 랭킹 · 일반부','her','여','여자 1 – 10위',T['open여자'][:10],F),ten('국가 랭킹 · 일반부','her','여','여자 11 – 20위',T['open여자'][10:],F),
 twenty('학생부 랭킹 · U12 – 대학부','him','남','학생부 남자 TOP 20',T['student남자'],'최근 1년 내 출전 선수 기준'),twenty('학생부 랭킹 · U12 – 대학부','her','여','학생부 여자 TOP 20',T['student여자'],'최근 1년 내 출전 선수 기준 · 박솔민 학생부 역대 최고점 1885점'),
 C[4]]
extra+=open('theme_lime.css').read()
html=lambda cs:f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{css}{extra}</style></head><body style="margin:0;background:#141418">'+''.join(card(i+1,len(cs),b) for i,b in enumerate(cs))+'</body></html>'
for k,cs in [('part1',P1),('part2',P2),('part3',P3)]:
    os.makedirs(k,exist_ok=True); open(f'{k}/cards.html','w').write(html(cs)); print(k,len(cs))
