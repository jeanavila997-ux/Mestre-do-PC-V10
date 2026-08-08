import requests
import time

TARGET_URL = "http://127.0.0.1:7777"
# TestSprite injects __AUTH_HEADERS__ from the project credential. We configured
# an API key whose value must be sent as the X-Mestre-Client header.
AUTH_HEADERS = {"X-Mestre-Client": __AUTH_HEADERS__.get("X-API-Key", "v10-web")}

def test_run_safe_readonly_command():
    payload = {"cmd": "whoami"}
    r = requests.post(
        f"{TARGET_URL}/run",
        headers={**AUTH_HEADERS, "Content-Type": "application/json"},
        json=payload,
        timeout=10,
    )
    assert r.status_code in (202, 200), f"Unexpected status {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("success") is True, f"Command not accepted: {data}"
    job_id = data.get("jobId")
    assert job_id, f"Missing jobId: {data}"

    # Poll for completion
    deadline = time.time() + 30
    while time.time() < deadline:
        status_r = requests.get(
            f"{TARGET_URL}/run-status",
            params={"id": job_id},
            headers={**AUTH_HEADERS, "Content-Type": "application/json"},
            timeout=5,
        )
        status = status_r.json()
        if status.get("state") != "running":
            break
        time.sleep(1)

    assert status.get("state") == "completed", f"Job did not complete: {status}"
    assert status.get("success") is True, f"Command failed: {status}"
    output = status.get("output", "")
    assert output.strip(), f"Expected non-empty output: {status}"
    print(f"PASS: /run executed whoami and completed with output")

if __name__ == "__main__":
    test_run_safe_readonly_command()
