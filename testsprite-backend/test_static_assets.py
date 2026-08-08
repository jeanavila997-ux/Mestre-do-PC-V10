import requests

TARGET_URL = "http://127.0.0.1:7777"

def test_static_assets_served_with_cache_headers():
    for path in ("/", "/index.html", "/logo-mestre-v7-transparent.png", "/favicon.png"):
        r = requests.get(f"{TARGET_URL}{path}", timeout=5)
        assert r.status_code == 200, f"Expected 200 for {path}, got {r.status_code}"
        if path.endswith(".png"):
            cc = r.headers.get("Cache-Control", "")
            assert "immutable" in cc or "max-age" in cc, f"Missing cache header for {path}: {cc}"
    print("PASS: static assets served with expected cache headers")

if __name__ == "__main__":
    test_static_assets_served_with_cache_headers()
