#!/usr/bin/env python3
"""Health check for worldcup-2026 services."""

import urllib.request, urllib.error
import datetime, os, sys

now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
log_path = os.path.expanduser("~/worldcup-app/logs/health.log")

def check(url, label, timeout=15):
    req = urllib.request.Request(url, method="GET")
    req.add_header("User-Agent", "Hermes-Cron/1.0")
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        body = resp.read().decode("utf-8", "replace")[:200]
        return True, f"{resp.status} {body.strip()}"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return False, f"Connection error: {e.reason}"
    except Exception as e:
        return False, f"Error: {e}"

healthy_local, local_detail = check("http://localhost:3001/api/health", "localhost:3001")
healthy_worldcup, worldcup_detail = check("https://worldcup26.ir/get/games", "worldcup26.ir")

log_lines = []
log_lines.append(f"[{now}] HEALTH CHECK")
log_lines.append(f"  localhost:3001/api/health -> {'HEALTHY' if healthy_local else 'UNHEALTHY'} ({local_detail})")
log_lines.append(f"  worldcup26.ir/get/games  -> {'HEALTHY' if healthy_worldcup else 'UNHEALTHY'} ({worldcup_detail})")

if not healthy_local or not healthy_worldcup:
    log_lines.append("  => Restarting pm2 worldcup-2026...")
    rc = os.system("pm2 restart worldcup-2026")
    if rc == 0:
        log_lines.append("  => pm2 restart SUCCESS")
    else:
        log_lines.append(f"  => pm2 restart FAILED (exit code {rc})")
else:
    log_lines.append("  => Both healthy, no action needed.")

log_lines.append(f"[{now}] HEALTH CHECK END\n")

log_entry = "\n".join(log_lines)

os.makedirs(os.path.dirname(log_path), exist_ok=True)
with open(log_path, "a") as f:
    f.write(log_entry)

print(log_entry)
