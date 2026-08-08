import requests

TARGET_URL = "http://127.0.0.1:7777"

def test_ollama_tags_returns_json():
    r = requests.get(f"{TARGET_URL}/ollama/tags", timeout=10)
    assert r.status_code in (200, 502), f"Unexpected status {r.status_code}: {r.text}"
    data = r.json()
    assert "models" in data, f"Missing models in response: {data}"
    assert isinstance(data["models"], list), f"models should be a list: {data}"
    print(f"PASS: /ollama/tags returned {len(data['models'])} models")

if __name__ == "__main__":
    test_ollama_tags_returns_json()
