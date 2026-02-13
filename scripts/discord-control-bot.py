#!/usr/bin/env python3
import json
import os
import re
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path


def load_env_file(path: str = '.env.local') -> None:
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file()

CONFIG = {
    'token': os.getenv('DISCORD_BOT_TOKEN', ''),
    'guild_id': os.getenv('DISCORD_GUILD_ID', ''),
    'channel_ids': [
        os.getenv('DISCORD_FILINGS1_CHANNEL_ID', ''),
        os.getenv('DISCORD_FILINGS_CHANNEL_ID', ''),
        os.getenv('DISCORD_FILINGS2_CHANNEL_ID', ''),
    ],
    'api_base_url': os.getenv('BEACON_API_BASE_URL', 'http://127.0.0.1:3000'),
    'poll_ms': int(os.getenv('DISCORD_BOT_POLL_MS', '4000')),
    'openai_api_key': os.getenv('OPENAI_API_KEY', ''),
    'openai_model': os.getenv('OPENAI_MODEL', 'gpt-4o-mini'),
}
CONFIG['channel_ids'] = [c for c in CONFIG['channel_ids'] if c]

if not CONFIG['token']:
    raise RuntimeError('Missing DISCORD_BOT_TOKEN in .env.local')
if not CONFIG['guild_id']:
    raise RuntimeError('Missing DISCORD_GUILD_ID in .env.local')

DISCORD_API = 'https://discord.com/api/v10'
AUTH_HEADERS = {
    'Authorization': f"Bot {CONFIG['token']}",
    'Content-Type': 'application/json',
}

last_seen_by_channel: dict[str, str] = {}
conversation_state: dict[str, dict] = {}


def discord_request(path: str, method: str = 'GET', body: dict | None = None):
    data = None
    headers = dict(AUTH_HEADERS)
    if body is not None:
        data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(f"{DISCORD_API}{path}", method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            raw = res.read().decode('utf-8')
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        txt = e.read().decode('utf-8', errors='ignore')
        raise RuntimeError(f"Discord API {e.code}: {txt[:500]}") from e


def call_api(path: str):
    req = urllib.request.Request(f"{CONFIG['api_base_url']}{path}", method='GET')
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            raw = res.read().decode('utf-8')
            if 'application/json' in (res.headers.get('content-type') or ''):
                return json.loads(raw) if raw else {}
            return raw
    except urllib.error.HTTPError as e:
        txt = e.read().decode('utf-8', errors='ignore')
        raise RuntimeError(f"API {e.code}: {txt[:500]}") from e


def send_channel_message(channel_id: str, content: str):
    discord_request(f"/channels/{channel_id}/messages", method='POST', body={'content': content[:1900]})


def classify_intent_with_chatgpt(text: str):
    if not CONFIG['openai_api_key']:
        return ('none', None)

    prompt = {
        'model': CONFIG['openai_model'],
        'input': [
            {
                'role': 'system',
                'content': [
                    {
                        'type': 'input_text',
                        'text': (
                            'You classify Discord command intents for a SEC filing bot. '
                            'Return strict JSON only with keys: intent,arg. '
                            'Allowed intent: scan,cik,log,help,confirm_yes,confirm_no,none. '
                            'arg should be a 10-digit cik only when intent=cik; else null.'
                        )
                    }
                ]
            },
            {
                'role': 'user',
                'content': [
                    {'type': 'input_text', 'text': text}
                ]
            }
        ],
        'text': {
            'format': {
                'type': 'json_schema',
                'name': 'intent_schema',
                'schema': {
                    'type': 'object',
                    'properties': {
                        'intent': {
                            'type': 'string',
                            'enum': ['scan', 'cik', 'log', 'help', 'confirm_yes', 'confirm_no', 'none']
                        },
                        'arg': {
                            'anyOf': [
                                {'type': 'string', 'pattern': '^\\d{10}$'},
                                {'type': 'null'}
                            ]
                        }
                    },
                    'required': ['intent', 'arg'],
                    'additionalProperties': False
                }
            }
        }
    }

    req = urllib.request.Request(
        'https://api.openai.com/v1/responses',
        method='POST',
        headers={
            'Authorization': f"Bearer {CONFIG['openai_api_key']}",
            'Content-Type': 'application/json'
        },
        data=json.dumps(prompt).encode('utf-8')
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            raw = res.read().decode('utf-8')
        data = json.loads(raw) if raw else {}
        text_out = data.get('output_text', '').strip()
        parsed = json.loads(text_out) if text_out else {}
        intent = parsed.get('intent', 'none')
        arg = parsed.get('arg')
        if intent == 'cik' and isinstance(arg, str):
            arg = arg.zfill(10)
        if intent not in {'scan', 'cik', 'log', 'help', 'confirm_yes', 'confirm_no', 'none'}:
            return ('none', None)
        return (intent, arg)
    except Exception:
        return ('none', None)


def intent_from_message(text: str):
    t = text.strip().lower()
    if not t:
        return ('none', None)

    cik_match = re.search(r'\bcik\s*(\d{1,10})\b', t)
    if cik_match:
        return ('cik', cik_match.group(1).zfill(10))

    if any(k in t for k in ['scan', 'rss', 'scan-rss-feed']):
        return ('scan', None)
    if any(k in t for k in ['log', 'export', 'state.json']):
        return ('log', None)
    if any(k in t for k in ['help', 'menu', 'what can you do']):
        return ('help', None)
    if t in {'yes', 'y', 'confirm', 'go', 'here we go'}:
        return ('confirm_yes', None)
    if t in {'no', 'n', 'cancel', 'stop'}:
        return ('confirm_no', None)

    # fallback to ChatGPT classifier for natural-language commands
    ai_intent, ai_arg = classify_intent_with_chatgpt(text)
    if ai_intent != 'none':
        return (ai_intent, ai_arg)

    return ('none', None)


def state_key(channel_id: str, author_id: str) -> str:
    return f"{channel_id}:{author_id}"


def ask_next(channel_id: str, author_id: str):
    send_channel_message(channel_id, f"<@{author_id}> What do you want to do next? You can say: scan rss, cik <CIK>, log, help.")


def process_intent(channel_id: str, author_id: str, text: str):
    key = state_key(channel_id, author_id)
    state = conversation_state.get(key, {'pending': None, 'arg': None})

    intent, arg = intent_from_message(text)

    if intent == 'help':
        send_channel_message(channel_id, f"<@{author_id}> I can help with: `scan rss`, `cik <CIK>`, `log`. I will confirm before running.")
        return

    if intent in {'scan', 'log', 'cik'}:
        state['pending'] = intent
        state['arg'] = arg
        conversation_state[key] = state
        if intent == 'scan':
            send_channel_message(channel_id, f"<@{author_id}> Next I will scan RSS feed. Please confirm by replying `yes`.")
        elif intent == 'log':
            send_channel_message(channel_id, f"<@{author_id}> Next I will export log/state. Please confirm by replying `yes`.")
        else:
            send_channel_message(channel_id, f"<@{author_id}> Next I will fetch cik-json for `{arg}`. Please confirm by replying `yes`.")
        return

    if intent == 'confirm_no':
        conversation_state[key] = {'pending': None, 'arg': None}
        send_channel_message(channel_id, f"<@{author_id}> Cancelled. Tell me your next command.")
        return

    if intent == 'confirm_yes' and state.get('pending'):
        pending = state['pending']
        pending_arg = state.get('arg')
        send_channel_message(channel_id, f"<@{author_id}> Here we go.")
        try:
            if pending == 'scan':
                data = call_api('/api/scan-rss-feed')
                count = len(data.get('results', [])) if isinstance(data, dict) else '?'
                send_channel_message(channel_id, f"<@{author_id}> Here is the result: scan completed with {count} result(s).")
            elif pending == 'log':
                call_api('/api/log')
                send_channel_message(channel_id, f"<@{author_id}> Here is the result: log export completed.")
            elif pending == 'cik' and pending_arg:
                call_api(f"/api/cik-json?cik={urllib.parse.quote(pending_arg)}")
                send_channel_message(channel_id, f"<@{author_id}> Here is the result: cik-json completed for {pending_arg}.")
            else:
                send_channel_message(channel_id, f"<@{author_id}> I don't have a valid pending action.")
        except Exception as e:
            send_channel_message(channel_id, f"<@{author_id}> Sorry, command failed: {str(e)[:1400]}")
        finally:
            conversation_state[key] = {'pending': None, 'arg': None}
            ask_next(channel_id, author_id)
        return

    if intent == 'none':
        if state.get('pending'):
            send_channel_message(channel_id, f"<@{author_id}> I am waiting for confirmation. Reply `yes` or `no`.")
        else:
            send_channel_message(channel_id, f"<@{author_id}> I can help. Say `scan rss`, `cik <CIK>`, `log`, or `help`.")


def prime_watermarks():
    for channel_id in CONFIG['channel_ids']:
        messages = discord_request(f"/channels/{channel_id}/messages?limit=1")
        if isinstance(messages, list) and messages and messages[0].get('id'):
            last_seen_by_channel[channel_id] = messages[0]['id']


def poll_channel(channel_id: str):
    after = last_seen_by_channel.get(channel_id)
    query = f"?after={after}&limit=50" if after else '?limit=25'
    messages = discord_request(f"/channels/{channel_id}/messages{query}")
    if not isinstance(messages, list) or not messages:
        return

    messages_sorted = sorted(messages, key=lambda m: int(m['id']))
    for m in messages_sorted:
        last_seen_by_channel[channel_id] = m['id']
        if m.get('author', {}).get('bot'):
            continue
        if m.get('guild_id') != CONFIG['guild_id']:
            continue
        process_intent(channel_id, m.get('author', {}).get('id', ''), m.get('content', ''))


def main():
    if not CONFIG['channel_ids']:
        raise RuntimeError('Missing DISCORD_FILINGS_CHANNEL_ID / DISCORD_FILINGS2_CHANNEL_ID')
    prime_watermarks()
    print(f"python discord bot ready; channels={','.join(CONFIG['channel_ids'])}; poll={CONFIG['poll_ms']}ms")

    while True:
        for channel_id in CONFIG['channel_ids']:
            try:
                poll_channel(channel_id)
            except Exception as e:
                print(f"poll failed for {channel_id}: {e}")
        time.sleep(max(CONFIG['poll_ms'], 500) / 1000.0)


if __name__ == '__main__':
    main()
