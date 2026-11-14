# 한국 스쿼시 랭킹 블로그 시리즈

Blog posts and Instagram cards written from the KSF ratings data in `data/ksf/` (ladder as built 2026-11-12, 전국체전 included).

- `series/part1_데이터와_원리.md`, `part2_현재_랭킹.md`, `part3_기록실.md` – the three-part blog series
- `series/part1/`, `part2/`, `part3/` – 1080×1080 cards for each part (Glass Court black + lime)
- `series/instagram_captions.txt` – one caption per part
- `blog.md` – the same content as a single post; `cards/png/` – a single 7-card set
- `cards/source/` – card build: `python3 build_series.py` writes `partN/cards.html`, then
  `node render.js partN ../../series/partN <names>` renders the PNGs (needs Playwright and Noto Sans KR).
  `top20.json` holds the Top 20 lists (players with a match in the last year).
