"""
review.py  —  Post-exam AI verdict script
==========================================
Reads every session_report.json under flags/, sends each flagged image
to Gemini Vision API, and fills in ai_verdict + ai_reason in-place.

Usage:
    # Review all sessions
    python review.py

    # Review a specific session
    python review.py --session session_1783430822068

    # Dry run (no API calls, no writes)
    python review.py --dry-run

Verdicts written back:
    HIGH_RISK    — clear, deliberate cheating behaviour
    SUSPICIOUS   — ambiguous, warrants human review
    FALSE_ALARM  — flag was triggered but image shows normal behaviour
"""

import os
import json
import time
import base64
import argparse
from pathlib import Path

from dotenv import load_dotenv
from google import genai
client = None
from PIL import Image

# Load environment variables from .env file
load_dotenv()

# ── Config ───────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
FLAGS_ROOT     = "flags"
MODEL_NAME     = "gemini-3.1-flash-lite"
RPM_LIMIT      = 14
RETRY_LIMIT    = 3

VALID_VERDICTS = {"HIGH_RISK", "SUSPICIOUS", "FALSE_ALARM"}

# ── Prompt factory ───────────────────────────────────────────────────────────

def build_prompt(flag: dict) -> str:
    alert_type    = flag.get("alert_type", "UNKNOWN")
    detail        = flag.get("detail", "")
    yaw           = flag.get("yaw_degrees")
    pitch         = flag.get("pitch_degrees")
    ear           = flag.get("ear_value")

    sensor_lines = []
    if yaw   is not None: sensor_lines.append(f"  Head yaw  : {yaw:.1f}°  (+ = right, - = left)")
    if pitch is not None: sensor_lines.append(f"  Head pitch: {pitch:.1f}°  (+ = up, - = down)")
    if ear   is not None: sensor_lines.append(f"  EAR value : {ear:.3f}  (< 0.15 = eyes closed)")
    sensor_block = "\n".join(sensor_lines) if sensor_lines else "  No sensor data available."

    alert_context = {
        "GAZE_LEFT"       : "The system detected the student looking LEFT for an extended period.",
        "GAZE_RIGHT"      : "The system detected the student looking RIGHT for an extended period.",
        "NO_FACE"         : "The system detected NO face in the frame — student may have left their seat.",
        "MULTIPLE_FACES"  : "The system detected MORE THAN ONE face — a second person may be present.",
        "EYES_CLOSED"     : "The system detected the student's eyes closed for an extended period.",
    }.get(alert_type, f"The system triggered a '{alert_type}' alert.")

    return f"""You are an AI proctoring reviewer for an online examination system.

A flag was automatically raised during a student's exam. Your job is to look at the 
captured frame and decide whether this flag represents genuine cheating behaviour,
something suspicious, or a false alarm.

ALERT TYPE  : {alert_type}
DETAIL      : {detail}
SENSOR DATA :
{sensor_block}

ALERT CONTEXT:
{alert_context}

INSTRUCTIONS:
1. Look carefully at the student's face, eye direction, and surroundings.
2. Consider whether the flag matches what you see in the image.
3. Respond with EXACTLY this JSON format and nothing else:

{{
  "verdict": "<HIGH_RISK | SUSPICIOUS | FALSE_ALARM>",
  "reason": "<one concise sentence explaining your decision>"
}}

VERDICT DEFINITIONS:
- HIGH_RISK   : Clear, deliberate off-screen looking, absence, or another person visible.
- SUSPICIOUS  : Ambiguous — could be innocent but warrants human review.
- FALSE_ALARM : Student appears to be looking at screen normally; sensor likely misfired.

Important: Return ONLY the JSON object. No markdown, no explanation, no backticks.
"""

# ── Gemini call ──────────────────────────────────────────────────────────────

def call_gemini(image_path: str, prompt: str) -> dict:
    """Send image + prompt to Gemini, return parsed verdict dict."""
    import urllib.request
    from io import BytesIO
    
    try:
        if image_path.startswith("http://") or image_path.startswith("https://"):
            supabase_key = os.environ.get("SUPABASE_KEY")
            req = urllib.request.Request(image_path)
            if supabase_key and "supabase.co" in image_path:
                req.add_header("apikey", supabase_key)
                req.add_header("Authorization", f"Bearer {supabase_key}")
            with urllib.request.urlopen(req) as response:
                img = Image.open(BytesIO(response.read()))
        else:
            img = Image.open(image_path)
    except Exception as e:
        print(f"      [!] Failed to open image at {image_path}: {e}")
        return {"verdict": "SUSPICIOUS", "reason": f"Failed to load image for visual analysis: {e}"}

    global client
    if client is None:
        client = genai.Client(api_key=GEMINI_API_KEY)

    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[prompt, img]
            )
            text = response.text.strip()

            # Strip accidental markdown fences
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()

            parsed = json.loads(text)

            verdict = parsed.get("verdict", "").strip().upper()
            reason  = parsed.get("reason",  "").strip()

            if verdict not in VALID_VERDICTS:
                raise ValueError(f"Unexpected verdict value: '{verdict}'")

            return {"verdict": verdict, "reason": reason}

        except json.JSONDecodeError as e:
            print(f"      [!] JSON parse error (attempt {attempt}): {e}")
        except ValueError as e:
            print(f"      [!] Validation error (attempt {attempt}): {e}")
        except Exception as e:
            print(f"      [!] Gemini error (attempt {attempt}): {e}")
            if "quota" in str(e).lower() or "429" in str(e):
                print("      [!] Rate limit hit — waiting 60s")
                time.sleep(60)

        if attempt < RETRY_LIMIT:
            time.sleep(2)

    return {"verdict": "SUSPICIOUS", "reason": "AI review failed after retries — flagged for manual review."}

# ── Session processor ────────────────────────────────────────────────────────

def process_session(session_dir: Path, dry_run: bool = False) -> dict:
    report_path = session_dir / "session_report.json"

    if not report_path.exists():
        print(f"  [!] No session_report.json found — skipping.")
        return {"skipped": True}

    with open(report_path, "r") as f:
        report = json.load(f)

    flags       = report.get("flags", [])
    session_id  = report.get("session_id", session_dir.name)
    total       = len(flags)
    pending     = [f for f in flags if f.get("ai_verdict") is None]

    print(f"\n{'='*60}")
    print(f"  Session  : {session_id}")
    print(f"  Flags    : {total} total, {len(pending)} pending review")
    print(f"{'='*60}")

    if not pending:
        print("  [OK] All flags already reviewed.")
        return {"session_id": session_id, "reviewed": 0, "already_done": total}

    reviewed = 0
    interval = 60 / RPM_LIMIT

    for i, flag in enumerate(flags):
        if flag.get("ai_verdict") is not None:
            continue

        flag_id    = flag.get("flag_id", f"flag_{i+1:03d}")
        alert_type = flag.get("alert_type", "UNKNOWN")

        # Resolve image path
        raw_path   = flag.get("image_path", "")
        is_remote  = raw_path.startswith("http://") or raw_path.startswith("https://")
        
        if is_remote:
            image_path_str = raw_path
            image_exists = True
        else:
            image_path = Path(raw_path)
            if not image_path.is_absolute():
                if not image_path.exists():
                    image_path = session_dir / image_path.name
            image_path_str = str(image_path)
            image_exists = image_path.exists()

        print(f"\n  [{flag_id}] {alert_type}")

        if not image_exists:
            print(f"    [!] Image not found at '{image_path_str}' — marking SUSPICIOUS")
            flag["ai_verdict"] = "SUSPICIOUS"
            flag["ai_reason"]  = "Image file missing — could not perform visual review."
        elif dry_run:
            print(f"    [DRY RUN] Would send: {image_path_str}")
            flag["ai_verdict"] = "SUSPICIOUS"
            flag["ai_reason"]  = "Dry run — no API call made."
        else:
            prompt = build_prompt(flag)
            result = call_gemini(image_path_str, prompt)
            flag["ai_verdict"] = result["verdict"]
            flag["ai_reason"]  = result["reason"]
            print(f"    Verdict : {result['verdict']}")
            print(f"    Reason  : {result['reason']}")
            reviewed += 1

            # Rate limit: sleep between calls
            pending_remaining = len([f for f in flags[i+1:] if f.get("ai_verdict") is None])
            if pending_remaining > 0:
                time.sleep(interval)

        # Write back after every flag so progress is saved on crash/interrupt
        if not dry_run:
            with open(report_path, "w") as f:
                json.dump(report, f, indent=2)

    # ── Session-level verdict summary ────────────────────────────────────────
    all_verdicts = [f.get("ai_verdict") for f in flags if f.get("ai_verdict")]
    if "HIGH_RISK" in all_verdicts:
        session_verdict = "CRITICAL"
    elif "SUSPICIOUS" in all_verdicts:
        session_verdict = "SUSPICIOUS"
    else:
        session_verdict = "NORMAL"

    high_risk_count  = all_verdicts.count("HIGH_RISK")
    suspicious_count = all_verdicts.count("SUSPICIOUS")
    false_alarm_count = all_verdicts.count("FALSE_ALARM")

    report["ai_session_verdict"] = session_verdict
    report["ai_summary"] = (
        f"{high_risk_count} HIGH_RISK, "
        f"{suspicious_count} SUSPICIOUS, "
        f"{false_alarm_count} FALSE_ALARM "
        f"out of {total} flags."
    )

    if not dry_run:
        with open(report_path, "w") as f:
            json.dump(report, f, indent=2)

    print(f"\n  == Session Review Complete ==")
    print(f"     Session verdict : {session_verdict}")
    print(f"     Summary         : {report['ai_summary']}")

    return {
        "session_id"     : session_id,
        "reviewed"       : reviewed,
        "session_verdict": session_verdict,
        "summary"        : report["ai_summary"]
    }

# ── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Post-exam AI proctoring review")
    parser.add_argument("--session", type=str, default=None,
                        help="Review a specific session ID only")
    parser.add_argument("--dry-run", action="store_true",
                        help="Skip API calls; mark all pending as SUSPICIOUS")
    args = parser.parse_args()

    if not GEMINI_API_KEY and not args.dry_run:
        print("[ERROR] GEMINI_API_KEY environment variable not set.")
        print("        Set it with: export GEMINI_API_KEY=your_key_here")
        return

    if not args.dry_run:
        global client
        client = genai.Client(api_key=GEMINI_API_KEY)

    flags_root = Path(FLAGS_ROOT)
    if not flags_root.exists():
        print(f"[ERROR] flags/ directory not found in '{os.getcwd()}'")
        return

    # Collect session directories to process
    if args.session:
        session_dirs = [flags_root / args.session]
        if not session_dirs[0].exists():
            print(f"[ERROR] Session '{args.session}' not found under {FLAGS_ROOT}/")
            return
    else:
        session_dirs = sorted(
            [d for d in flags_root.iterdir() if d.is_dir()]
        )

    if not session_dirs:
        print("No session directories found.")
        return

    print(f"\nProctor AI Review")
    print(f"  Model     : {MODEL_NAME}")
    print(f"  Sessions  : {len(session_dirs)}")
    print(f"  Dry run   : {args.dry_run}")

    results = []
    for session_dir in session_dirs:
        result = process_session(session_dir, dry_run=args.dry_run)
        results.append(result)

    # ── Final summary ────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  REVIEW COMPLETE - {len(results)} session(s) processed")
    print(f"{'='*60}")
    for r in results:
        if r.get("skipped"):
            continue
        sid     = r.get("session_id", "?")
        verdict = r.get("session_verdict", "-")
        summary = r.get("summary", "")
        print(f"  {sid:40s}  [{verdict}]  {summary}")

if __name__ == "__main__":
    main()