#!/usr/bin/env bash
# Lighthouse (mobile profile) for the given paths against a running `vite preview` on :4180.
# Usage: scripts/lighthouse.sh / /engineering
set -euo pipefail
OUT="${LH_OUT:-/tmp}"
for path in "$@"; do
  name=$(echo "$path" | tr '/' '_'); name=${name:-_}
  for attempt in 1 2 3; do
    npx -y lighthouse@12 "http://localhost:4180$path" --quiet --chrome-flags="--headless=new" --output=json \
      --output-path="$OUT/lh$name.json" --only-categories=performance,accessibility,best-practices,seo >/dev/null 2>&1 || true
    python3 - "$OUT/lh$name.json" "$path" <<'PY' && break
import json, sys
d = json.load(open(sys.argv[1]))
if d.get('runtimeError'):
    sys.exit(1)
c, a = d['categories'], d['audits']
print(sys.argv[2].ljust(14), ' '.join(f"{k}:{round(v['score']*100)}" for k, v in c.items()),
      '| FCP', a['first-contentful-paint']['displayValue'], 'LCP', a['largest-contentful-paint']['displayValue'])
js = [(round(i.get('transferSize', 0) / 1024), i['url'].split('/')[-1]) for i in a['network-requests']['details']['items'] if i['url'].endswith('.js')]
print('   js:', js)
PY
  done
done
