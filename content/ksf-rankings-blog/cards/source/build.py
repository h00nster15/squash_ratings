css=open('base.css').read()
extra='''
  .card{font-family:var(--f)}
  .rk{display:grid;grid-template-columns:64px 1fr auto;gap:18px;align-items:center;padding:19px 0;border-bottom:1.5px solid var(--line)}
  .rk:last-child{border-bottom:0}
  .rk .n{font:900 40px var(--f);color:var(--kick)} .rk.top .n{color:var(--gold)}
  .rk .nm{font:900 38px/1.15 var(--f)} .rk .nm small{display:block;font:500 21px var(--f);color:var(--muted);margin-top:5px}
  .rk .pt2{font:900 42px var(--f);text-align:right} .rk .pt2 small{display:block;font:500 20px var(--f);color:var(--muted);margin-top:2px}
  .rk.s{padding:19px 0;grid-template-columns:40px 1fr auto;gap:12px} .rk.s .n{font-size:32px} .rk.s .nm{font-size:34px} .rk.s .nm small{font-size:19px} .rk.s .pt2{font-size:34px}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:26px}
  .two .panel{margin-top:0;padding:6px 24px}
  .two h3{font:700 24px var(--f);color:var(--kick);margin:14px 0 2px;display:flex;gap:10px;align-items:center}
  .vsline{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:22px;background:var(--panel);border:1.5px solid var(--panel-b);border-radius:18px;padding:20px 34px}
  .vsline .tm{font:900 46px var(--f)} .vsline .tm small{display:block;font:700 21px var(--f);color:var(--kick);margin-top:4px}
  .vsline .x{font:900 68px var(--f);color:var(--gold)}
  .h2h{display:grid;grid-template-columns:270px 1fr auto;gap:14px;padding:11px 0;border-bottom:1.5px solid var(--line);font:700 25px var(--f);align-items:center}
  .h2h:last-child{border-bottom:0} .h2h .d{color:var(--muted);font-weight:500} .h2h .r{font-weight:900} .h2h.a .r{color:var(--gold)} .h2h.b .r{color:var(--w)}
  .stat{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;padding:16px 0;border-bottom:1.5px solid var(--line)}
  .stat:last-child{border-bottom:0} .stat .k{font:500 23px var(--f);color:var(--kick)} .stat .v{font:900 33px/1.2 var(--f);margin-top:3px}
  .stat .num{font:900 46px var(--f);color:var(--gold);text-align:right} .stat .num small{display:block;font:500 19px var(--f);color:var(--muted)}
  .bars{margin-top:8px} .bar{margin:22px 0}
  .bar .lb{display:flex;justify-content:space-between;font:700 26px var(--f);margin-bottom:10px} .bar .lb b{font-weight:900;font-size:34px}
  .bar .tr{height:26px;border-radius:13px;background:rgba(255,255,255,.1);overflow:hidden} .bar .tr i{display:block;height:100%;border-radius:13px;background:var(--gold)} .bar.b .tr i{background:var(--w)}
  .nums{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:30px}
  .nums div{background:var(--panel);border:1.5px solid var(--panel-b);border-radius:18px;padding:22px 10px;text-align:center}
  .nums b{display:block;font:900 54px var(--f)} .nums span{font:500 22px var(--f);color:var(--soft)}
'''
extra+=open('theme_lime.css').read()
FOOT='<div class="foot"><span><b>Glass Court</b> · Squash Academy at Wellperion</span><span>@glass_court</span></div>'
def card(i,n,body):
    return f'<section class="card" id="c{i}"><div class="court"></div><div class="box l"></div><div class="box r"></div><div class="pg">{i} / {n}</div><div class="in">{body}{FOOT}</div></section>'
def rk(n,nm,team,pts,rec,s=False):
    return f'<div class="rk{" top" if n==1 else ""}{" s" if s else ""}"><div class="n">{n}</div><div class="nm">{nm}<small>{team}</small></div><div class="pt2">{pts}'+(f'<small>{rec}</small>' if rec else '')+'</div></div>'
C=[]
C.append('''<p class="kick">KOREA SQUASH RANKINGS · 2026.11</p>
<h1 class="t xl">한국 스쿼시<br>랭킹 업데이트</h1>
<p class="sub">8년치 경기 결과로 만든 랭킹 · 2026 전국체전까지 반영</p>
<div class="nums"><div><b>5,054</b><span>개인전 경기</span></div><div><b>741</b><span>선수</span></div><div><b>8년</b><span>2018 – 2026</span></div></div>
<div class="panel">
<div class="pt"><div class="n">1</div><div><h4>전국체전 결승이 순위를 흔들었습니다</h4><p>남자 일반부 1, 2위 차이가 단 29점</p></div></div>
<div class="pt"><div class="n">2</div><div><h4>역대 최고점이 3개 나왔습니다</h4><p>남자 일반부 · 여자 일반부 · 학생부 모두 10월에 경신</p></div></div>
<div class="pt"><div class="n">3</div><div><h4>순위 높은 선수가 이길 확률 78%</h4><p>연맹 포인트 순위보다 잘 맞았습니다</p></div></div>
</div>''')
M=[(1,'이민우','충청북도체육회',1930,'65승 5패'),(2,'나주영','충청남도체육회',1901,'32승 4패'),(3,'오서진','인천광역시체육회',1757,'25승 10패'),(4,'고영조','광주광역시체육회',1676,'20승 11패'),(5,'강우석','울산광역시체육회',1670,'31승 17패')]
W=[(1,'엄화영','인천광역시체육회',1874,'52승 7패'),(2,'허민경','경상남도체육회',1746,'38승 10패'),(3,'최유라','경상남도체육회',1741,'25승 8패'),(4,'이지현','대전광역시체육회',1696,'30승 13패'),(5,'양연수','전라남도청',1671,'25승 13패')]
C.append('<p class="kick">국가 랭킹 · 일반부</p><h1 class="t" style="display:flex;gap:16px;align-items:center"><span class="sq him">남</span>남자 TOP 5</h1><div class="panel" style="padding-top:4px;padding-bottom:4px">'+''.join(rk(*r) for r in M)+'</div><p class="fine">최근 1년 내 출전 선수 기준 · 점수 옆은 최근 3년 전적 · 1, 2위 차이 단 29점</p>')
C.append('<p class="kick">국가 랭킹 · 일반부</p><h1 class="t" style="display:flex;gap:16px;align-items:center"><span class="sq her">여</span>여자 TOP 5</h1><div class="panel" style="padding-top:4px;padding-bottom:4px">'+''.join(rk(*r) for r in W)+'</div><p class="fine">최근 1년 내 출전 선수 기준 · 점수 옆은 최근 3년 전적 · 엄화영 역대 최고점 경신</p>')
SM=[(1,'박민기','한국체육대학교',1754),(2,'김찬영','대구스쿼시유스클럽',1696),(3,'김준호','중앙대학교',1693),(4,'이용욱','중앙대학교',1664),(5,'김서준','장호원중학교',1629)]
SW=[(1,'박솔민','동일미래과학고',1885),(2,'이해인','나주스포츠클럽',1728),(3,'김하연','한국체육대학교',1636),(4,'서예은','신안산대학교',1628),(5,'이재인','언양고등학교',1593)]
C.append('<p class="kick">학생부 랭킹 · U12 – 대학부</p><h1 class="t">학생부 TOP 5</h1><div class="two"><div class="panel"><h3><span class="sq him">남</span>남자</h3>'+''.join(rk(n,a,b,p,'',True) for n,a,b,p in SM)+'</div><div class="panel"><h3><span class="sq her">여</span>여자</h3>'+''.join(rk(n,a,b,p,'',True) for n,a,b,p in SW)+'</div></div><p class="close">박솔민, 전국체전 우승으로<br><em>학생부 역대 최고점 1885점</em></p>')
H=[('2024.08','나주영 승','3–1','b'),('2025.03','나주영 승','3–2','b'),('2025.06','이민우 승','3–1','a'),('2025.08','이민우 승','3–1','a'),('2025.10 전국체전','나주영 승','3–2','b'),('2026.06','이민우 승','3–2','a'),('2026.10 전국체전','나주영 승','3–1','b')]
C.append('<p class="kick">RIVALRY · 남자 일반부</p><h1 class="t">지금 가장 뜨거운 라이벌</h1><div class="vsline"><div class="tm">이민우<small>랭킹 1위 · 1930점</small></div><div class="x">3 – 4</div><div class="tm" style="text-align:right">나주영<small>랭킹 2위 · 1901점</small></div></div><div class="panel" style="margin-top:18px;padding-top:6px;padding-bottom:6px">'+''.join(f'<div class="h2h {c}"><div class="d" style="grid-column:1/2;white-space:nowrap">{d}</div><div>{w}</div><div class="r">{s}</div></div>' for d,w,s,c in H)+'</div><p class="fine">이민우의 8년간 일반부 패배는 단 7번, 그중 4번이 나주영</p>')
S=[('일반부 최다승 · 승률 1위','이민우','74승','승률 91.4%'),('학생부 최다승','박솔민','65승','65승 9패'),('최다 경기 (개인전)','이민우','135경기','125승 10패'),('일반부 최다 우승','이민우','12회','2위 엄화영 9회'),('역대 최고 점수','이민우','1942점','2026.10')]
C.append('<p class="kick">RECORDS · 2018 – 2026</p><h1 class="t">8년치 기록실</h1><div class="panel" style="padding-top:4px;padding-bottom:4px">'+''.join(f'<div class="stat"><div><div class="k">{k}</div><div class="v">{v}</div></div><div class="num">{n}<small>{s}</small></div></div>' for k,v,n,s in S)+'</div>')
C.append('''<p class="kick">HOW IT WORKS</p><h1 class="t">이 랭킹, 잘 맞을까요?</h1>
<p class="sub" style="margin-top:14px">순위가 높은 선수가 실제로 이긴 비율<br>2024–2026 일반부 385경기</p>
<div class="panel"><div class="bars">
<div class="bar"><div class="lb"><span>경기 결과 랭킹</span><b>78.4%</b></div><div class="tr"><i style="width:78.4%"></i></div></div>
<div class="bar b"><div class="lb"><span>연맹 포인트 시즌 합계</span><b>69.6%</b></div><div class="tr"><i style="width:69.6%"></i></div></div>
</div></div>
<div class="panel">
<div class="pt"><div class="n">1</div><div><h4>누구를 이겼는지를 봅니다</h4><p>강한 상대를 이길수록 많이 오릅니다</p></div></div>
<div class="pt"><div class="n">2</div><div><h4>몇 대 몇인지도 봅니다</h4><p>3:0 완승과 3:2 신승은 다르게 반영</p></div></div>
</div>
<p class="fine">최근 3년 경기만 반영 · 일반부와 학생부는 따로 계산 · 자세한 내용은 블로그에서</p>''')
n=len(C)
open('cards.html','w').write(f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{css}{extra}</style></head><body style="margin:0;background:#141418">'+''.join(card(i+1,n,b) for i,b in enumerate(C))+'</body></html>')
print(n)
