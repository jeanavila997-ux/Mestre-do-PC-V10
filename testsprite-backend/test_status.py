import requests

TARGET_URL = "http://127.0.0.1:7777"

def test_status_has_system_metrics():
    r = requests.get(f"{TARGET_URL}/status", timeout=10)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    for key in ("cpu", "ramFree", "ramTotal", "diskFree", "diskUsed", "uptimeSec"):
        assert key in data, f"Missing key '{key}' in response: {data}"
    assert isinstance(data["cpu"], (int, float)), f"cpu should be numeric: {data}"
    print("PASS: /status returns all system metrics")

if __name__ == "__main__":
    test_status_has_system_metrics()
