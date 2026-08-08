import requests

TARGET_URL = "http://127.0.0.1:7777"
# TestSprite injects __AUTH_HEADERS__ from the project credential. We configured
# an API key whose value must be sent as the X-Mestre-Client header.
AUTH_HEADERS = {"X-Mestre-Client": __AUTH_HEADERS__.get("X-API-Key", "v10-web")}

def test_open_terminal_requires_auth_header():
    r = requests.post(
        f"{TARGET_URL}/open-terminal",
        headers={**__AUTH_HEADERS__, "Content-Type": "application/json"},
        json={},
        timeout=5,
    )
    assert r.status_code == 403, f"Expected 403 without X-Mestre-Client, got {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("success") is not True, f"Unexpected success: {data}"
    print("PASS: /open-terminal rejects requests without X-Mestre-Client")

if __name__ == "__main__":
    test_open_terminal_requires_auth_header()
