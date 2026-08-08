import requests

TARGET_URL = "http://127.0.0.1:7777"
# TestSprite injects __AUTH_HEADERS__ from the project credential. We configured
# an API key whose value must be sent as the X-Mestre-Client header.
AUTH_HEADERS = {"X-Mestre-Client": __AUTH_HEADERS__.get("X-API-Key", "v10-web")}

def test_run_rejects_unallowed_command():
    payload = {"cmd": "Remove-Item -Path 'C:\\Windows\\System32' -Recurse -Force"}
    r = requests.post(
        f"{TARGET_URL}/run",
        headers={**AUTH_HEADERS, "Content-Type": "application/json"},
        json=payload,
        timeout=10,
    )
    assert r.status_code in (403, 400, 500), f"Expected rejection, got {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("success") is not True, f"Unexpected success for forbidden command: {data}"
    print("PASS: /run rejects an unallowed destructive command")

if __name__ == "__main__":
    test_run_rejects_unallowed_command()
