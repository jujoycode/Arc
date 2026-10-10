"""Exercise Arc's local MySQL + Mailpit acceptance flow. Run after backend starts."""

import json
import os
import re
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

API = os.environ.get("ARC_API_URL", "http://localhost:8080/api/").rstrip("/")
MAIL = os.environ.get("ARC_MAIL_URL", "http://localhost:8025/api/v1/").rstrip("/")


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
        with urllib.request.urlopen(req, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    assert status == expected, f"{path}: expected {expected}, got {status}: {raw[:250]!r}"
    return json.loads(raw) if raw else None


def mail_token(email, subject):
    for _ in range(15):
        listing = json.load(urllib.request.urlopen(MAIL + "/messages", timeout=10))
        for item in listing["messages"]:
            if item["Subject"] == subject and any(to["Address"] == email for to in item["To"]):
                message = json.load(urllib.request.urlopen(MAIL + "/message/" + item["ID"], timeout=10))
                return re.search(r"token=([^\s]+)", message["Text"]).group(1)
        time.sleep(0.2)
    raise AssertionError(f"Missing {subject} for {email}")


def account(email, password):
    request("/auth/register", {"email": email, "displayName": email.split("@")[0], "password": password})
    request("/auth/verify?token=" + mail_token(email, "arcat 이메일 확인"), method="POST")
    return request("/auth/login", {"email": email, "password": password})["token"]


def main():
    suffix = uuid.uuid4().hex[:8]
    password = "local-smoke-password-123"
    owner_email = f"smoke-owner-{suffix}@example.com"
    member_email = f"smoke-member-{suffix}@example.com"
    owner = account(owner_email, password)
    member = account(member_email, password)
    request("/auth/register", {"email": f"long-password-{suffix}@example.com", "displayName": "Invalid password", "password": "a" * 73}, expected=400)
    workspace_name = "Smoke " + suffix
    workspace = request("/auth/workspaces", {"name": workspace_name}, owner)
    wid = workspace["id"]
    project = request(f"/workspaces/{wid}/projects", {"name": "Smoke project", "key": "SMOKE"}, owner)
    pid = project["id"]
    request(f"/workspaces/{wid}/projects", {"name": "Duplicate project key", "key": "SMOKE"}, owner, expected=409)
    child_project = request(f"/workspaces/{wid}/projects", {"name": "Child project", "key": "CHILD", "parentProjectId": pid}, owner)
    child_pid = child_project["id"]
    request(f"/projects/{child_pid}", {"name": "Child project", "key": "CHILDX", "parentProjectId": pid}, owner, method="PUT")
    request(f"/projects/{pid}", token=member, expected=403)
    request(f"/auth/workspaces/{wid}/invitations", {"email": member_email, "role": "MEMBER"}, owner)
    invite = mail_token(member_email, "arcat 팀 초대")
    request("/auth/invitations/accept?token=" + invite, method="POST", token=owner, expected=403)
    request("/auth/invitations/accept?token=" + invite, method="POST", token=member)
    request(f"/workspaces/{wid}/projects", {"name": "Denied", "key": "DENIED"}, member, expected=403)

    member_id = request("/auth/me", token=member)["id"]
    owner_id = request("/auth/me", token=owner)["id"]
    epic = request(f"/projects/{pid}/issues", {"title": "Epic", "type": "EPIC", "startDate": "2026-10-01", "dueDate": "2026-10-31"}, owner)
    story = request(f"/projects/{pid}/issues", {"title": "Story", "type": "STORY", "assigneeId": member_id, "parentId": epic["id"], "startDate": "2026-10-03", "dueDate": "2026-10-12", "storyPoints": 5}, owner)
    second = request(f"/projects/{pid}/issues", {"title": "Second", "type": "TASK"}, owner)
    child_issue = request(f"/projects/{child_pid}/issues", {"title": "Child schedule", "type": "STORY", "startDate": "2026-10-05", "dueDate": "2026-10-20"}, owner)
    assert child_issue["key"] == "CHILDX-1"
    # A later invalid item must roll back the earlier valid reorder as well.
    reorder_before = request(f"/projects/{pid}/issues/{epic['id']}", token=member)
    request(f"/projects/{pid}/backlog/order", {"issueIds": [epic["id"], child_issue["id"]]}, owner, method="PUT", expected=400)
    reorder_after = request(f"/projects/{pid}/issues/{epic['id']}", token=member)
    assert reorder_after["sortOrder"] == reorder_before["sortOrder"]
    assert reorder_after["version"] == reorder_before["version"]
    request(f"/projects/{child_pid}", {"name": "Child project", "key": "CHILD", "parentProjectId": pid}, owner, method="PUT", expected=409)
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
        created = list(pool.map(lambda index: request(f"/projects/{pid}/issues", {"title": f"Concurrent {index}", "type": "TASK"}, owner), range(6)))
    assert len({item["key"] for item in created}) == 6
    first_page = request(f"/projects/{pid}/issues?size=5&page=0&sort=key&direction=asc", token=member)
    second_page = request(f"/projects/{pid}/issues?size=5&page=1&sort=key&direction=asc", token=member)
    assert first_page["total"] == 9 and len(first_page["items"]) == 5 and len(second_page["items"]) == 4
    assert first_page["items"][0]["key"] == epic["key"]
    assert request(f"/projects/{pid}/issues?search=Story&type=STORY&size=5", token=member)["total"] == 1
    assert request(f"/projects/{pid}/issues?sprintState=BACKLOG", token=member)["total"] == 9
    request(f"/projects/{pid}/issues?sort=drop_table", token=member, expected=400)
    for field in ("startDate", "progress", "storyPoints"):
        for direction in ("asc", "desc"):
            sorted_page = request(f"/projects/{pid}/issues?size=1000&sort={field}&direction={direction}", token=member)
            values = [item[field] for item in sorted_page["items"] if item[field] is not None]
            assert values == sorted(values, reverse=direction == "desc"), f"Server {field} {direction} ordering"
    comment = request(f"/projects/{pid}/issues/{story['id']}/comments", {"body": "Comment"}, member)
    request(f"/projects/{pid}/comments/{comment['id']}", {"body": "Not mine"}, owner, method="PUT", expected=403)
    request(f"/projects/{pid}/comments/{comment['id']}", {"body": "Updated"}, member, method="PUT")
    assert request(f"/projects/{pid}/issues/{story['id']}/comments", token=owner)[0]["body"] == "Updated"
    request(f"/projects/{pid}/comments/{comment['id']}", token=owner, method="DELETE")
    assert not request(f"/projects/{pid}/issues/{story['id']}/comments", token=member)
    before = request(f"/projects/{pid}/issues/{story['id']}", token=member)
    request(f"/projects/{pid}/issues/{story['id']}/status", {"status": "IN_PROGRESS", "version": before["version"]}, member, method="PATCH")
    request(f"/projects/{pid}/issues/{story['id']}/status", {"status": "DONE", "version": before["version"]}, member, method="PATCH", expected=409)
    request(f"/projects/{pid}/issues/{story['id']}/relations", {"targetId": second["id"], "type": "BLOCKS"}, owner)
    request(f"/projects/{pid}/issues/{second['id']}/relations", {"targetId": story["id"], "type": "BLOCKS"}, owner, expected=400)
    # WBS planning is manager-owned through every API; members retain full team visibility.
    protected_before = request(f"/projects/{pid}/issues/{story['id']}", token=member)
    request(f"/projects/{pid}/issues", {"title": "Denied scope", "type": "TASK"}, member, expected=403)
    request(f"/projects/{pid}/issues/{story['id']}", {**protected_before, "title": "Denied plan", "parentId": None}, member, method="PUT", expected=403)
    request(f"/projects/{pid}/issues/{story['id']}", token=member, method="DELETE", expected=403)
    request(f"/projects/{pid}/backlog/order", {"issueIds": [story["id"]]}, member, method="PUT", expected=403)
    request(f"/projects/{pid}/issues/{story['id']}/sprint", {"sprintId": None}, member, method="PUT", expected=403)
    request(f"/projects/{pid}/issues/{story['id']}/relations", {"targetId": second["id"], "type": "PRECEDES"}, member, expected=403)
    relations = request(f"/projects/{pid}/relations", token=member)
    request(f"/projects/{pid}/relations/{relations[0]['id']}", token=member, method="DELETE", expected=403)
    second_before = request(f"/projects/{pid}/issues/{second['id']}", token=member)
    request(f"/projects/{pid}/issues/{second['id']}/status", {"status": "DONE", "version": second_before["version"]}, member, method="PATCH", expected=403)
    request(f"/projects/{pid}/issues/{second['id']}/execution", {"status": "DONE", "progress": 100, "version": second_before["version"]}, member, method="PATCH", expected=403)
    assert request(f"/projects/{pid}/issues/{second['id']}", token=member) == second_before
    request(f"/projects/{pid}/issues/{story['id']}/execution", {"status": "REVIEW", "progress": 101, "version": protected_before["version"]}, member, method="PATCH", expected=400)
    assert request(f"/projects/{pid}/issues/{story['id']}", token=member) == protected_before
    request(f"/projects/{pid}/issues/{story['id']}/execution", {"status": "REVIEW", "progress": 75, "version": protected_before["version"], "title": "Ignored plan field", "assigneeId": owner_id, "parentId": None}, member, method="PATCH")
    execution = request(f"/projects/{pid}/issues/{story['id']}", token=member)
    assert execution["status"] == "REVIEW" and execution["progress"] == 75 and execution["version"] == protected_before["version"] + 1
    for field in ("title", "type", "description", "priority", "assigneeId", "parentId", "versionId", "startDate", "dueDate", "storyPoints", "sortOrder", "sprintId"):
        assert execution[field] == protected_before[field], f"Execution must preserve {field}"
    request(f"/projects/{pid}/issues/{story['id']}/execution", {"status": "DONE", "progress": 100, "version": protected_before["version"]}, member, method="PATCH", expected=409)
    assert request(f"/projects/{pid}/issues/{story['id']}", token=member) == execution
    assert any(item["type"] == "EXECUTION_UPDATED" for item in request(f"/projects/{pid}/issues/{story['id']}/activities", token=member))
    # Reassignment immediately revokes the previous developer's update capability.
    request(f"/projects/{pid}/issues/{story['id']}", {**execution, "assigneeId": owner_id}, owner, method="PUT")
    reassigned = request(f"/projects/{pid}/issues/{story['id']}", token=member)
    request(f"/projects/{pid}/issues/{story['id']}/execution", {"status": "DONE", "progress": 100, "version": reassigned["version"]}, member, method="PATCH", expected=403)
    request(f"/projects/{pid}/issues/{story['id']}/status", {"status": "DONE", "version": reassigned["version"]}, member, method="PATCH", expected=403)
    assert request(f"/projects/{pid}/issues/{story['id']}", token=member) == reassigned
    request(f"/projects/{pid}/issues/{story['id']}", {**reassigned, "assigneeId": member_id}, owner, method="PUT")
    request(f"/projects/{pid}/issues/{second['id']}/execution", {"status": "REVIEW", "progress": 35, "version": second_before["version"]}, owner, method="PATCH")
    request(f"/projects/{pid}/saved-views", {"name": "Mine", "filters": "{}", "options": "{}"}, member)
    request(f"/projects/{pid}/saved-views", {"name": "Invalid JSON", "filters": "{broken", "options": "{}"}, member, expected=400)
    assert len(request(f"/projects/{pid}/saved-views", token=owner)) == 0

    # Comments remain collaborative even on unassigned tickets.
    team_comment = request(f"/projects/{pid}/issues/{second['id']}/comments", {"body": "Team collaboration"}, member)
    assert request(f"/projects/{pid}/issues/{second['id']}/comments", token=owner)[0]["id"] == team_comment["id"]
    request(f"/projects/{pid}/comments/{team_comment['id']}", token=owner, method="DELETE")
    # Default workspace managers appoint scoped project managers without promoting their workspace role.
    outsider = account(f"smoke-outsider-{suffix}@example.com", password)
    outsider_id = request("/auth/me", token=outsider)["id"]
    request(f"/projects/{pid}/managers/{member_id}", token=member, method="PUT", expected=403)
    request(f"/projects/{pid}/managers/{outsider_id}", token=owner, method="PUT", expected=400)
    request(f"/projects/{pid}/managers/{member_id}", token=outsider, method="PUT", expected=403)
    request(f"/projects/{pid}/issues/{story['id']}/execution", {"status": "DONE", "progress": 100, "version": 1}, outsider, method="PATCH", expected=403)
    assert request(f"/projects/{pid}", token=member)["managerIds"] == []
    for _ in range(2):
        request(f"/projects/{pid}/managers/{member_id}", token=owner, method="PUT")
    assert request(f"/projects/{pid}", token=member)["managerIds"] == [member_id]
    assert request("/auth/workspaces", token=member)[0]["role"] == "MEMBER"
    request(f"/projects/{pid}/managers/{owner_id}", token=member, method="PUT", expected=403)
    request(f"/projects/{pid}/managers/{member_id}", token=member, method="DELETE", expected=403)
    request(f"/projects/{child_pid}/issues", {"title": "Denied inherited manager", "type": "TASK"}, member, expected=403)
    request(f"/projects/{pid}", {"name": "Denied project setting"}, member, method="PUT", expected=403)
    planned_ticket = request(f"/projects/{pid}/issues", {"title": "Project manager plan", "type": "TASK", "assigneeId": owner_id}, member)
    planned_before = request(f"/projects/{pid}/issues/{planned_ticket['id']}", token=member)
    request(f"/projects/{pid}/issues/{planned_ticket['id']}", {**planned_before, "title": "Project manager updated plan", "storyPoints": 8}, member, method="PUT")
    planned_updated = request(f"/projects/{pid}/issues/{planned_ticket['id']}", token=member)
    request(f"/projects/{pid}/issues/{planned_ticket['id']}/execution", {"status": "REVIEW", "progress": 80, "version": planned_updated["version"]}, member, method="PATCH")
    relation = request(f"/projects/{pid}/issues/{epic['id']}/relations", {"targetId": planned_ticket["id"], "type": "PRECEDES"}, member)
    request(f"/projects/{pid}/relations/{relation['id']}", token=member, method="DELETE")
    request(f"/projects/{pid}/backlog/order", {"issueIds": [planned_ticket["id"]]}, member, method="PUT")
    planned_sprint = request(f"/projects/{pid}/sprints", {"name": "Manager sprint", "startOn": "2026-10-01", "endOn": "2026-10-14"}, member)
    request(f"/projects/{pid}/issues/{planned_ticket['id']}/sprint", {"sprintId": planned_sprint["id"]}, member, method="PUT")
    request(f"/projects/{pid}/sprints/{planned_sprint['id']}/start", {}, member)
    request(f"/projects/{pid}/sprints/{planned_sprint['id']}/close", {}, member)
    request(f"/projects/{pid}/versions", {"name": "Manager release", "dueDate": "2026-10-31"}, member)
    request(f"/projects/{pid}/issues/{planned_ticket['id']}", token=member, method="DELETE")
    for _ in range(2):
        request(f"/projects/{pid}/managers/{member_id}", token=owner, method="DELETE")
    assert request(f"/projects/{pid}", token=member)["managerIds"] == []
    request(f"/projects/{pid}/issues", {"title": "Denied after revocation", "type": "TASK"}, member, expected=403)
    current_second = request(f"/projects/{pid}/issues/{second['id']}", token=member)
    request(f"/projects/{pid}/issues/{second['id']}/execution", {"status": "DONE", "progress": 100, "version": current_second["version"]}, member, method="PATCH", expected=403)
    sprint = request(f"/projects/{pid}/sprints", {"name": "Sprint 1", "startOn": "2026-10-01", "endOn": "2026-10-14"}, owner)
    next_sprint = request(f"/projects/{pid}/sprints", {"name": "Sprint 2", "startOn": "2026-10-15", "endOn": "2026-10-28"}, owner)
    request(f"/projects/{pid}/issues/{story['id']}/sprint", {"sprintId": sprint["id"]}, owner, method="PUT")
    start = request(f"/projects/{pid}/sprints/{sprint['id']}/start", {}, owner)
    assert start["issueCount"] == 1 and start["storyPoints"] == 5
    request(f"/projects/{pid}/sprints/{next_sprint['id']}/start", {}, owner, expected=409)
    close = request(f"/projects/{pid}/sprints/{sprint['id']}/close", {"nextSprintId": next_sprint["id"]}, owner)
    assert close["issueCount"] == 1 and close["doneCount"] == 0 and close["remainingPoints"] == 5 and close["donePoints"] == 0
    assert request(f"/projects/{pid}/issues/{story['id']}", token=member)["sprintId"] == next_sprint["id"]
    assert len(request(f"/projects/{pid}/sprints/{sprint['id']}/history", token=member)) == 1
    request(f"/projects/{pid}/sprints/{sprint['id']}/close", {}, owner, expected=409)
    assert len(request(f"/projects/{pid}/sprints/{sprint['id']}/history", token=member)) == 1
    assert any(item["type"] == "SPRINT_CHANGED" for item in request(f"/projects/{pid}/issues/{story['id']}/activities", token=member))

    request(f"/projects/{pid}", {"name": "Smoke project", "archived": True}, owner, method="PUT")
    request(f"/projects/{pid}/issues/{story['id']}", token=member)
    archived_ticket = request(f"/projects/{pid}/issues/{story['id']}", token=member)
    request(f"/projects/{pid}/issues/{story['id']}/execution", {"status": "DONE", "progress": 100, "version": archived_ticket["version"]}, member, method="PATCH", expected=409)
    request(f"/projects/{pid}/issues/{story['id']}/comments", {"body": "Denied while archived"}, member, expected=409)
    request(f"/projects/{pid}/sprints/{next_sprint['id']}/start", {}, owner, expected=409)
    request(f"/projects/{pid}/managers/{member_id}", token=owner, method="PUT", expected=409)
    request(f"/projects/{pid}/backlog/order", {"issueIds": []}, member, method="PUT", expected=409)
    request(f"/projects/{pid}", {"name": "Smoke project", "archived": False}, owner, method="PUT")

    # Membership deletion cascades explicit project grants; rejoining does not restore them.
    request(f"/projects/{pid}/managers/{member_id}", token=owner, method="PUT")
    request(f"/auth/workspaces/{wid}/members/{member_id}", token=owner, method="DELETE")
    request(f"/projects/{pid}", token=member, expected=403)
    assert request(f"/projects/{pid}", token=owner)["managerIds"] == []
    request(f"/auth/workspaces/{wid}/invitations", {"email": member_email, "role": "MEMBER"}, owner)
    request("/auth/invitations/accept?token=" + mail_token(member_email, "arcat 팀 초대"), method="POST", token=member)
    request(f"/projects/{pid}/issues", {"title": "Denied after rejoining", "type": "TASK"}, member, expected=403)
    request(f"/auth/workspaces/{wid}/members/{request('/auth/me', token=member)['id']}/role", {"role": "ADMIN"}, owner, method="PATCH")
    admin_ticket = request(f"/projects/{pid}/issues/{second['id']}", token=member)
    request(f"/projects/{pid}/issues/{second['id']}/execution", {"status": "DONE", "progress": 100, "version": admin_ticket["version"]}, member, method="PATCH")
    request(f"/projects/{pid}/issues", {"title": "Admin planned ticket", "type": "TASK", "assigneeId": owner_id}, member)
    request(f"/auth/workspaces/{wid}/owner/{request('/auth/me', token=member)['id']}", {}, owner)
    request(f"/auth/workspaces/{wid}", {"confirmation": workspace_name}, member, method="DELETE")
    request(f"/projects/{pid}", token=owner, expected=403)
    print("Arc smoke flow passed: auth, invitation, isolation, project key, child-project gantt, hierarchy, dates, pagination, filters, concurrent issue IDs, conflict, WBS default/project manager/assignee permissions, scoped grants and revocation, membership cascade, collaborative comments, execution field preservation, reassignment, partial-write rollback, relation, sprint, archive, saved view, ownership, deletion")


if __name__ == "__main__":
    main()
