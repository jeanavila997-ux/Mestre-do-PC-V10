import requests

TARGET_URL = "http://127.0.0.1:7777"

def test_ping_returns_ok():
    r = requests.get(f"{TARGET_URL}/ping", timeout=5)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("status") == "ok", f"Unexpected status: {data}"
    assert "pid" in data, f"Missing pid in response: {data}"
    print("PASS: /ping returns status ok with pid")

if __name__ == "__main__":
    test_ping_returns_ok()
