import requests

TARGET_URL = "http://127.0.0.1:7777"

def test_mcp_status_is_reachable():
    r = requests.get(f"{TARGET_URL}/mcp-status", timeout=5)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert "status" in data, f"Missing status in response: {data}"
    assert data["status"] in ("online", "offline", "unknown"), f"Unexpected status value: {data}"
    print(f"PASS: /mcp-status returns status={data['status']}")

if __name__ == "__main__":
    test_mcp_status_is_reachable()
