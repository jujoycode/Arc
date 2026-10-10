"""Verify provider contracts, signed delivery, scope, idempotency, and recovery."""
import hashlib
import hmac
import json
import os
import time
import urllib.request
import uuid
from smoke import API, account, mail_token, request

FIXTURE = os.environ.get("ARC_PROVIDER_FIXTURE_URL")
assert FIXTURE, "Run only with the local provider fixture"
SECRET = "arc-fixture-webhook-secret-1234567890abcdef"


def delivery(connection_id, provider, payload, event, delivery_id=None, valid=True, expected=202):
    raw = json.dumps(payload, ensure_ascii=False).encode()
    delivery_id = delivery_id or uuid.uuid4().hex
    headers = {"Content-Type": "application/json"}
    if provider == "GITHUB":
        signature = hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()
        headers.update({"X-GitHub-Event": event, "X-GitHub-Delivery": delivery_id, "X-Hub-Signature-256": "sha256=" + (signature if valid else "0" * 64)})
    else:
        headers.update({"X-Gitlab-Event": event, "X-Gitlab-Event-UUID": delivery_id, "X-Gitlab-Token": SECRET if valid else "incorrect"})
    req = urllib.request.Request(f"{API}/integrations/webhooks/{connection_id}", data=raw, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status, body = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, body = error.code, error.read()
    assert status == expected, f"{provider} delivery: HTTP {status}, expected {expected}"
    return json.loads(body)


def until(probe, expected):
    for _ in range(60):
        result = probe()
        if expected(result):
            return result
        time.sleep(0.2)
    raise AssertionError("Timed out waiting for queued integration result")


def main():
    suffix = uuid.uuid4().hex[:8]
    password = "integration-test-password-123"
    owner = account(f"integration-owner-{suffix}@example.com", password)
    member_email = f"integration-member-{suffix}@example.com"
    member = account(member_email, password)
    name = f"Integration {suffix}"
    wid = request("/auth/workspaces", {"name": name}, owner)["id"]
    foreign_name = f"Foreign {suffix}"
    foreign_wid = request("/auth/workspaces", {"name": foreign_name}, owner)["id"]
    try:
        pid = request(f"/workspaces/{wid}/projects", {"name": "Integration", "key": "GIT"}, owner)["id"]
        foreign_pid = request(f"/workspaces/{foreign_wid}/projects", {"name": "Foreign", "key": "GIT"}, owner)["id"]
        issue = request(f"/projects/{pid}/issues", {"title": "연동 검증", "type": "TASK"}, owner)
        issue = request(f"/projects/{pid}/issues/{issue['id']}", token=owner)
        for i in range(2):
            request(f"/projects/{foreign_pid}/issues", {"title": f"Foreign {i}", "type": "TASK"}, owner)
        foreign_issue = request(f"/projects/{foreign_pid}/issues?sort=key&direction=asc", token=owner)["items"][1]
        request(f"/auth/workspaces/{wid}/invitations", {"email": member_email, "role": "MEMBER"}, owner)
        request("/auth/invitations/accept?token=" + mail_token(member_email, "arcat 팀 초대"), method="POST", token=member)
        data = {"provider": "GITHUB", "repository": "arc-fixture/repo", "token": "arc-fixture-token-123", "webhookSecret": SECRET}
        request(f"/projects/{pid}/repository-connections", data, member, expected=403)
        request(f"/projects/{pid}/repository-connections", {**data, "token": "invalid-fixture-token"}, owner, expected=400)
        github = request(f"/projects/{pid}/repository-connections", data, owner)["id"]
        gitlab = request(f"/projects/{pid}/repository-connections", {**data, "provider": "GITLAB"}, owner)["id"]
        listed = request(f"/projects/{pid}/repository-connections", token=owner)
        serialized = json.dumps(listed)
        assert listed["enabled"] and len(listed["items"]) == 2 and SECRET not in serialized and data["token"] not in serialized
        links_path = f"/projects/{pid}/issues/{issue['id']}/development-links"
        links = lambda: request(links_path, token=member)
        assert links() == []
        commit = {"repository": {"id": 101}, "commits": [{"id": "a" * 40, "message": "GIT-1 연동 · GIT-2 다른 팀 · OTHER-1", "timestamp": "2026-10-06T12:00:00Z", "url": "https://untrusted.example/"}]}
        delivery(github, "GITHUB", commit, "push", valid=False, expected=401)
        delivery(github, "GITHUB", {**commit, "repository": {"id": 999}}, "push", expected=400)
        key = uuid.uuid4().hex
        assert delivery(github, "GITHUB", commit, "push", key)["accepted"]
        assert not delivery(github, "GITHUB", commit, "push", key)["accepted"]
        until(links, lambda value: len(value) == 1)
        assert links()[0]["url"].startswith("https://github.com/arc-fixture/repo/commit/")
        assert request(f"/projects/{foreign_pid}/issues/{foreign_issue['id']}/development-links", token=owner) == []
        request(f"/projects/{pid}/issues/{foreign_issue['id']}/development-links", token=owner, expected=404)
        pull = {"repository": {"id": 101}, "pull_request": {"number": 7, "title": "GIT-1 PR", "body": "", "state": "open", "merged": False, "updated_at": "2026-10-06T12:00:00Z"}}
        delivery(github, "GITHUB", pull, "pull_request")
        delivery(github, "GITHUB", {**pull, "pull_request": {**pull["pull_request"], "state": "closed", "merged": True, "updated_at": "2026-10-06T12:10:00Z"}}, "pull_request")
        until(links, lambda value: any(item["kind"] == "CHANGE_REQUEST" and item["state"] == "MERGED" for item in value))
        delivery(github, "GITHUB", pull, "pull_request")
        lab_commit = {"project": {"id": 201}, "commits": [{"id": "b" * 40, "message": "GIT-1 GitLab commit", "timestamp": "2026-10-06T12:00:00Z"}]}
        delivery(gitlab, "GITLAB", lab_commit, "Push Hook", valid=False, expected=401)
        delivery(gitlab, "GITLAB", lab_commit, "Push Hook")
        merge = {"project": {"id": 201}, "object_attributes": {"iid": 3, "title": "GIT-1 MR", "description": "", "state": "merged", "updated_at": "2026-10-06 12:10:00 UTC"}}
        delivery(gitlab, "GITLAB", merge, "Merge Request Hook")
        until(links, lambda value: len(value) == 4)
        assert all(item["state"] == "MERGED" for item in links() if item["kind"] == "CHANGE_REQUEST")
        after = request(f"/projects/{pid}/issues/{issue['id']}", token=owner)
        assert after["status"] == issue["status"] and after["version"] == issue["version"]
        malformed_id = uuid.uuid4().hex
        delivery(github, "GITHUB", {"repository": {"id": 101}, "pull_request": {}}, "pull_request", malformed_id)
        history_path = f"/projects/{pid}/repository-connections/{github}/deliveries"
        failed = until(lambda: request(history_path, token=owner), lambda value: any(item["deliveryId"] == malformed_id and item["status"] == "FAILED" for item in value))
        failed_id = next(item["id"] for item in failed if item["deliveryId"] == malformed_id)
        request(f"{history_path}/{failed_id}/retry", {}, member, expected=403)
        request(f"{history_path}/{failed_id}/retry", {}, owner)
        with urllib.request.urlopen(urllib.request.Request(FIXTURE + "/control/github-deny", data=b"", method="POST")):
            pass
        assert request(f"/projects/{pid}/repository-connections/{github}/check", {}, owner)["status"] == "DISABLED"
        delivery(github, "GITHUB", commit, "push", expected=410)
        assert len(links()) == 4
        with urllib.request.urlopen(urllib.request.Request(FIXTURE + "/control/github-allow", data=b"", method="POST")):
            pass
        assert request(f"/projects/{pid}/repository-connections/{github}/check", {}, owner)["status"] == "ACTIVE"
        request(f"/projects/{pid}/repository-connections/{github}", token=member, method="DELETE", expected=403)
        request(f"/projects/{pid}/repository-connections/{github}", token=owner, method="DELETE")
        delivery(github, "GITHUB", commit, "push", expected=410)
        assert len(links()) == 4
        print("Integration acceptance passed: provider auth, encrypted-response boundary, manager permissions, signed GitHub/GitLab events, project/workspace isolation, duplicate delivery, merge ordering, unchanged issues, queue failure/retry, lost access, disconnect preserves links")
    finally:
        request(f"/auth/workspaces/{wid}", {"confirmation": name}, owner, method="DELETE")
        request(f"/auth/workspaces/{foreign_wid}", {"confirmation": foreign_name}, owner, method="DELETE")


if __name__ == "__main__":
    main()
