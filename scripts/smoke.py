"""Exercise Arc's local MySQL + Mailpit acceptance flow. Run after backend starts."""

import json
import re
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

API = "http://localhost:8080/api"
MAIL = "http://localhost:8025/api/v1"


def request(path, body=None, token=None, method=None, expected=200):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    assert status == expected, f"{path}: expected {expected}, got {status}: {raw[:250]!r}"
    return json.loads(raw) if raw else None


def mail_token(email, subject):
    for _ in range(15):
        listing = json.load(urllib.request.urlopen(MAIL + "/messages"))
        for item in listing["messages"]:
            if item["Subject"] == subject and any(to["Address"] == email for to in item["To"]):
                message = json.load(urllib.request.urlopen(MAIL + "/message/" + item["ID"]))
                return re.search(r"token=([^\s]+)", message["Text"]).group(1)
        time.sleep(0.2)
    raise AssertionError(f"Missing {subject} for {email}")


def account(email, password):
    request("/auth/register", {"email": email, "displayName": email.split("@")[0], "password": password})
    request("/auth/verify?token=" + mail_token(email, "Arc 이메일 확인"), method="POST")
    return request("/auth/login", {"email": email, "password": password})["token"]


def main():
    suffix = uuid.uuid4().hex[:8]
    password = "local-smoke-password-123"
    owner_email = f"smoke-owner-{suffix}@example.com"
    member_email = f"smoke-member-{suffix}@example.com"
    owner = account(owner_email, password)
    member = account(member_email, password)
    workspace_name = "Smoke " + suffix
    workspace = request("/auth/workspaces", {"name": workspace_name}, owner)
    wid = workspace["id"]
    project = request(f"/workspaces/{wid}/projects", {"name": "Smoke project", "key": "SMOKE"}, owner)
    pid = project["id"]
    child_project = request(f"/workspaces/{wid}/projects", {"name": "Child project", "key": "CHILD", "parentProjectId": pid}, owner)
    child_pid = child_project["id"]
    request(f"/projects/{pid}", token=member, expected=403)
    request(f"/auth/workspaces/{wid}/invitations", {"email": member_email, "role": "MEMBER"}, owner)
    invite = mail_token(member_email, "Arc 팀 초대")
    request("/auth/invitations/accept?token=" + invite, method="POST", token=owner, expected=403)
    request("/auth/invitations/accept?token=" + invite, method="POST", token=member)
    request(f"/workspaces/{wid}/projects", {"name": "Denied", "key": "DENIED"}, member, expected=403)

    epic = request(f"/projects/{pid}/issues", {"title": "Epic", "type": "EPIC", "startDate": "2026-10-01", "dueDate": "2026-10-31"}, member)
    story = request(f"/projects/{pid}/issues", {"title": "Story", "type": "STORY", "parentId": epic["id"], "startDate": "2026-10-03", "dueDate": "2026-10-12", "storyPoints": 5}, member)
    second = request(f"/projects/{pid}/issues", {"title": "Second", "type": "TASK"}, member)
    child_issue = request(f"/projects/{child_pid}/issues", {"title": "Child schedule", "type": "STORY", "startDate": "2026-10-05", "dueDate": "2026-10-20"}, member)
    gantt = request(f"/projects/{pid}/gantt", token=member)
    assert child_pid in {item["id"] for item in gantt["projects"]}
    assert child_issue["id"] in {item["id"] for item in gantt["issues"]}
    assert all(item["projectId"] in {pid, child_pid} for item in gantt["issues"])
    request(f"/projects/{pid}/issues/{epic['id']}", method="DELETE", token=owner, expected=409)
    epic_before = request(f"/projects/{pid}/issues/{epic['id']}", token=owner)
    request(f"/projects/{pid}/issues/{epic['id']}", {"title": "Epic", "type": "TASK", "status": epic_before["status"], "priority": epic_before["priority"], "version": epic_before["version"]}, owner, method="PUT", expected=400)
    request(f"/projects/{pid}/versions", {"name": "Invalid", "dueDate": "not-a-date"}, owner, expected=400)
    request(f"/projects/{pid}/sprints", {"name": "Invalid", "startOn": "not-a-date", "endOn": "2026-10-14"}, owner, expected=400)
    assert len({epic["key"], story["key"], second["key"]}) == 3
    with ThreadPoolExecutor(max_workers=6) as pool:
        created = list(pool.map(lambda index: request(f"/projects/{pid}/issues", {"title": f"Concurrent {index}", "type": "TASK"}, member), range(6)))
    assert len({item["key"] for item in created}) == 6
    first_page = request(f"/projects/{pid}/issues?size=5&page=0&sort=key&direction=asc", token=member)
    second_page = request(f"/projects/{pid}/issues?size=5&page=1&sort=key&direction=asc", token=member)
    assert first_page["total"] == 9 and len(first_page["items"]) == 5 and len(second_page["items"]) == 4
    assert first_page["items"][0]["key"] == epic["key"]
    assert request(f"/projects/{pid}/issues?search=Story&type=STORY&size=5", token=member)["total"] == 1
    assert request(f"/projects/{pid}/issues?sprintState=BACKLOG", token=member)["total"] == 9
    request(f"/projects/{pid}/issues?sort=drop_table", token=member, expected=400)
    before = request(f"/projects/{pid}/issues/{story['id']}", token=member)
    request(f"/projects/{pid}/issues/{story['id']}/status", {"status": "IN_PROGRESS", "version": before["version"]}, member, method="PATCH")
    request(f"/projects/{pid}/issues/{story['id']}/status", {"status": "DONE", "version": before["version"]}, member, method="PATCH", expected=409)
    request(f"/projects/{pid}/issues/{story['id']}/relations", {"targetId": second["id"], "type": "BLOCKS"}, member)
    request(f"/projects/{pid}/issues/{second['id']}/relations", {"targetId": story["id"], "type": "BLOCKS"}, member, expected=400)
    request(f"/projects/{pid}/saved-views", {"name": "Mine", "filters": "{}", "options": "{}"}, member)
    assert len(request(f"/projects/{pid}/saved-views", token=owner)) == 0

    sprint = request(f"/projects/{pid}/sprints", {"name": "Sprint 1", "startOn": "2026-10-01", "endOn": "2026-10-14"}, owner)
    next_sprint = request(f"/projects/{pid}/sprints", {"name": "Sprint 2", "startOn": "2026-10-15", "endOn": "2026-10-28"}, owner)
    request(f"/projects/{pid}/issues/{story['id']}/sprint", {"sprintId": sprint["id"]}, member, method="PUT")
    start = request(f"/projects/{pid}/sprints/{sprint['id']}/start", {}, owner)
    assert start["issueCount"] == 1 and start["storyPoints"] == 5
    request(f"/projects/{pid}/sprints/{next_sprint['id']}/start", {}, owner, expected=409)
    close = request(f"/projects/{pid}/sprints/{sprint['id']}/close", {"nextSprintId": next_sprint["id"]}, owner)
    assert close["issueCount"] == 1 and close["doneCount"] == 0
    assert request(f"/projects/{pid}/issues/{story['id']}", token=member)["sprintId"] == next_sprint["id"]
    assert len(request(f"/projects/{pid}/sprints/{sprint['id']}/history", token=member)) == 1

    request(f"/auth/workspaces/{wid}/members/{request('/auth/me', token=member)['id']}/role", {"role": "ADMIN"}, owner, method="PATCH")
    request(f"/auth/workspaces/{wid}/owner/{request('/auth/me', token=member)['id']}", {}, owner)
    request(f"/auth/workspaces/{wid}", {"confirmation": workspace_name}, member, method="DELETE")
    request(f"/projects/{pid}", token=owner, expected=403)
    print("Arc smoke flow passed: auth, invitation, isolation, child-project gantt, hierarchy, dates, pagination, filters, concurrent issue IDs, conflict, relation, sprint, saved view, ownership, deletion")


if __name__ == "__main__":
    main()
