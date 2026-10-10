"""Ticket-field policy acceptance against real MySQL/Mailpit; owns its fixtures."""

from copy import deepcopy
import uuid

from smoke import account, mail_token, request


def field(key, kind, label, *, required=False, options=None, order=0):
    return {
        "key": key, "type": kind, "label": label, "description": "",
        "active": True, "required": required, "order": order, "options": options or [],
    }


def assert_field_error(response, key):
    assert response.get("error"), response
    assert key in response.get("fieldErrors", {}), f"Expected field error for {key}: {response}"


def save_ticket(project_id, body, token, issue_id=None):
    path = f"/projects/{project_id}/issues"
    if issue_id is not None:
        request(f"{path}/{issue_id}", body, token, method="PUT")
    else:
        issue_id = request(path, body, token)["id"]
    return request(f"{path}/{issue_id}", token=token)


def main():
    suffix = uuid.uuid4().hex[:8]
    password = "ticket-fields-smoke-password-123"
    owner = account(f"fields-owner-{suffix}@example.com", password)
    developer_email = f"fields-dev-{suffix}@example.com"
    developer = account(developer_email, password)
    workspace_name = f"Ticket fields {suffix}"
    other_name = f"Other fields {suffix}"
    wid = other_wid = None
    try:
        wid = request("/auth/workspaces", {"name": workspace_name}, owner)["id"]
        other_wid = request("/auth/workspaces", {"name": other_name}, owner)["id"]
        pid = request(f"/workspaces/{wid}/projects", {"name": "Field policy", "key": "FIELD"}, owner)["id"]
        other_pid = request(f"/workspaces/{other_wid}/projects", {"name": "Isolated policy", "key": "OTHER"}, owner)["id"]
        path = f"/auth/workspaces/{wid}/ticket-fields"
        other_path = f"/auth/workspaces/{other_wid}/ticket-fields"
        request(f"/auth/workspaces/{wid}/invitations", {"email": developer_email, "role": "MEMBER"}, owner)
        request("/auth/invitations/accept?token=" + mail_token(developer_email, "arcat 팀 초대"), token=developer, method="POST")
        developer_id = request("/auth/me", token=developer)["id"]
        policy = request(path, token=owner)
        assert policy["workspaceId"] == wid and isinstance(policy["revision"], int)
        assert request(path, token=developer) == policy
        request(other_path, token=developer, expected=403)
        request(path, policy, developer, method="PUT", expected=403)
        request(f"/projects/{pid}/managers/{developer_id}", token=owner, method="PUT")
        request(path, policy, developer, method="PUT", expected=403)
        # A scoped planning manager never acquires workspace configuration rights.
        legacy = save_ticket(pid, {
            "title": "Legacy assigned plan", "type": "TASK", "assigneeId": developer_id,
            "priority": "HIGH", "startDate": "2026-10-01", "storyPoints": 0,
        }, developer)
        request(f"/projects/{pid}/managers/{developer_id}", token=owner, method="DELETE")
        assert legacy["customFields"] == {}
        initial_policy = deepcopy(policy)
        policy["customFields"] = [
            field("risk_note", "TEXT", "위험 메모", required=True, order=0),
            field("estimate_cost", "NUMBER", "예상 비용", order=1),
            field("review_day", "DATE", "검토일", order=2),
            field("delivery_channel", "SELECT", "출시 채널", order=3, options=[
                {"value": "web", "label": "웹", "active": True},
                {"value": "mobile", "label": "모바일", "active": True},
            ]),
        ]
        policy = request(path, policy, owner, method="PUT")
        assert policy["revision"] > initial_policy["revision"]
        assert request(other_path, token=owner)["customFields"] == []
        stale = request(path, initial_policy, owner, method="PUT", expected=409)
        assert stale.get("code") == "TICKET_FIELDS_CHANGED", stale
        # Protected semantic fields and conditional parents are not configurable workflow.
        for key in ("title", "type", "status", "progress"):
            invalid = deepcopy(policy)
            next(item for item in invalid["standardFields"] if item["key"] == key)["visible"] = False
            request(path, invalid, owner, method="PUT", expected=400)
        invalid = deepcopy(policy)
        parent_definition = next(item for item in invalid["standardFields"] if item["key"] == "parentId")
        parent_definition["required"] = True
        request(path, invalid, owner, method="PUT", expected=400)
        invalid = deepcopy(policy)
        next(item for item in invalid["standardFields"] if item["key"] == "description").update(visible=False, required=True)
        request(path, invalid, owner, method="PUT", expected=400)
        invalid = deepcopy(policy)
        invalid["customFields"][0]["type"] = "NUMBER"
        request(path, invalid, owner, method="PUT", expected=400)
        invalid = deepcopy(policy)
        invalid["customFields"] = invalid["customFields"][1:]
        request(path, invalid, owner, method="PUT", expected=400)

        def create(values=None, **extras):
            return {"title": "Custom plan", "type": "TASK", "fieldRevision": policy["revision"], "customFields": {"risk_note": "외부 일정 확인", **(values or {})}, **extras}

        missing = request(f"/projects/{pid}/issues", {"title": "Missing", "type": "TASK"}, owner, expected=400)
        assert_field_error(missing, "customFields.risk_note")
        blank = request(f"/projects/{pid}/issues", create({"risk_note": "   "}), owner, expected=400)
        assert_field_error(blank, "customFields.risk_note")
        for key, value in (
            ("estimate_cost", "12"), ("estimate_cost", 1_000_000_001),
            ("estimate_cost", 0.1234567), ("review_day", "2026-02-30"),
            ("review_day", "2026-13-01"), ("delivery_channel", "foreign-choice"),
            ("foreign_field", "injected"),
        ):
            invalid_value = request(f"/projects/{pid}/issues", create({key: value}), owner, expected=400)
            assert_field_error(invalid_value, f"customFields.{key}")
        isolated = request(f"/projects/{other_pid}/issues", {"title": "Cross-workspace", "type": "TASK", "customFields": {"risk_note": "wrong workspace"}}, owner, expected=400)
        assert_field_error(isolated, "customFields.risk_note")
        # A configured standard requirement is enforced alongside custom requirements.
        next(item for item in policy["standardFields"] if item["key"] == "description")["required"] = True
        policy = request(path, policy, owner, method="PUT")
        missing_standard = request(f"/projects/{pid}/issues", create(), owner, expected=400)
        assert_field_error(missing_standard, "description")
        next(item for item in policy["standardFields"] if item["key"] == "description")["required"] = False
        policy = request(path, policy, owner, method="PUT")
        for date_field, date_value in (("startDate", "2026-02-30"), ("dueDate", "2026-13-01"), ("startDate", "0001-01-01")):
            invalid_date = request(f"/projects/{pid}/issues", create(**{date_field: date_value}), owner, expected=400)
            assert_field_error(invalid_date, date_field)
        reversed_dates = request(f"/projects/{pid}/issues", create(startDate="2026-10-20", dueDate="2026-10-10"), owner, expected=400)
        assert_field_error(reversed_dates, "dueDate")
        ticket = save_ticket(pid, create({"estimate_cost": 0, "review_day": "2028-02-29", "delivery_channel": "web"}, assigneeId=developer_id), owner)
        assert ticket["customFields"]["estimate_cost"] == 0
        assert ticket["customFields"]["review_day"] == "2028-02-29"
        request(f"/projects/{pid}/managers/{developer_id}", token=owner, method="PUT")
        request(path, policy, developer, method="PUT", expected=403)
        ticket = save_ticket(pid, {**ticket, "customFields": {"risk_note": "프로젝트 관리자 검토"}}, developer, ticket["id"])
        assert ticket["customFields"]["risk_note"] == "프로젝트 관리자 검토"
        request(f"/projects/{pid}/managers/{developer_id}", token=owner, method="DELETE")
        nullable = save_ticket(pid, create({"estimate_cost": None}), owner)
        assert nullable["customFields"].get("estimate_cost") is None
        # Required plan fields cannot block an existing assignee's reporting or comments.
        request(f"/projects/{pid}/issues/{legacy['id']}/execution", {"status": "IN_PROGRESS", "progress": 0, "version": legacy["version"]}, developer, method="PATCH")
        legacy = request(f"/projects/{pid}/issues/{legacy['id']}", token=owner)
        assert legacy["progress"] == 0 and legacy["customFields"] == {}
        request(f"/projects/{pid}/issues/{legacy['id']}/comments", {"body": "필수 계획 필드와 무관한 진행 공유"}, developer)
        rejected_plan = request(f"/projects/{pid}/issues/{legacy['id']}", {**legacy, "title": "Needs new plan field"}, owner, method="PUT", expected=400)
        assert_field_error(rejected_plan, "customFields.risk_note")
        assert request(f"/projects/{pid}/issues/{legacy['id']}", token=owner) == legacy
        request(f"/projects/{pid}/issues/{ticket['id']}", {**ticket, "customFields": {"risk_note": "Denied"}}, developer, method="PUT", expected=403)
        # Promote to ADMIN and save a workspace policy, then return to MEMBER.
        request(f"/auth/workspaces/{wid}/members/{developer_id}/role", {"role": "ADMIN"}, owner, method="PATCH")
        next(item for item in policy["standardFields"] if item["key"] == "title")["label"] = "업무 제목"
        for key in ("priority", "startDate", "parentId"):
            next(item for item in policy["standardFields"] if item["key"] == key)["visible"] = False
        policy = request(path, policy, developer, method="PUT")
        request(f"/auth/workspaces/{wid}/members/{developer_id}/role", {"role": "MEMBER"}, owner, method="PATCH")
        stale_ticket = request(f"/projects/{pid}/issues/{ticket['id']}", {**ticket, "title": "Unsaved field-policy draft", "fieldRevision": policy["revision"] - 1}, owner, method="PUT", expected=409)
        assert stale_ticket.get("code") == "TICKET_FIELDS_CHANGED", stale_ticket
        assert request(f"/projects/{pid}/issues/{ticket['id']}", token=owner) == ticket
        updated_legacy = dict(legacy, title="Preserved hidden plan", customFields={"risk_note": "확인 완료"})
        for key in ("priority", "startDate"):
            updated_legacy.pop(key, None)
        legacy = save_ticket(pid, updated_legacy, owner, legacy["id"])
        assert legacy["priority"] == "HIGH" and legacy["startDate"].startswith("2026-10-01")
        # Subtask hierarchy remains mandatory even when the generic parent field is hidden.
        no_parent = request(f"/projects/{pid}/issues", create(type="SUBTASK"), owner, expected=400)
        assert no_parent.get("error")
        request(f"/projects/{pid}/issues", create(type="SUBTASK", parentId=ticket["id"]), owner)
        request(f"/projects/{pid}/issues", create(type="EPIC", parentId=ticket["id"]), owner, expected=400)
        hierarchy_epic = save_ticket(pid, create(type="EPIC"), owner)
        converted = save_ticket(pid, create(type="STORY", parentId=hierarchy_epic["id"]), owner)
        converted = save_ticket(pid, {**converted, "type": "EPIC"}, owner, converted["id"])
        assert converted["parentId"] is None, "Changing an existing ticket to Epic clears a hidden obsolete parent"
        # Stable choice identities survive rename and deactivation; new tickets cannot pick retired choices.
        for definition in policy["customFields"]:
            if definition["key"] == "delivery_channel":
                definition["options"][0].update(label="웹 서비스", active=False)
        policy = request(path, policy, owner, method="PUT")
        retired_choice = request(f"/projects/{pid}/issues", create({"delivery_channel": "web"}), owner, expected=400)
        assert_field_error(retired_choice, "customFields.delivery_channel")
        ticket = save_ticket(pid, {**ticket, "title": "Keep retired selection", "fieldRevision": policy["revision"]}, owner, ticket["id"])
        assert ticket["customFields"]["delivery_channel"] == "web"
        invalid = deepcopy(policy)
        next(item for item in invalid["customFields"] if item["key"] == "delivery_channel")["options"] = [{"value": "mobile", "label": "모바일", "active": True}]
        request(path, invalid, owner, method="PUT", expected=400)
        # Deactivation never deletes existing values; omission by a legacy client preserves them.
        next(item for item in policy["customFields"] if item["key"] == "estimate_cost")["active"] = False
        policy = request(path, policy, owner, method="PUT")
        old_values = deepcopy(ticket["customFields"])
        omitted = dict(ticket, title="Legacy client preserves values")
        omitted.pop("customFields")
        ticket = save_ticket(pid, omitted, owner, ticket["id"])
        assert ticket["customFields"] == old_values
        ticket = save_ticket(pid, {**ticket, "customFields": {"estimate_cost": 99}}, owner, ticket["id"])
        assert ticket["customFields"]["estimate_cost"] == 0, "Disabled values are preserved even when a client echoes a different value"
        # Explicitly clearing an optional field distinguishes null from numeric zero.
        ticket = save_ticket(pid, {**ticket, "customFields": {"review_day": None}}, owner, ticket["id"])
        assert ticket["customFields"]["review_day"] is None
        assert ticket["customFields"]["estimate_cost"] == 0
        before_execution = deepcopy(ticket)
        request(f"/projects/{pid}/issues/{ticket['id']}/execution", {"status": "REVIEW", "progress": 75, "version": ticket["version"], "customFields": {"risk_note": "Ignored injection"}}, developer, method="PATCH")
        ticket = request(f"/projects/{pid}/issues/{ticket['id']}", token=owner)
        assert ticket["customFields"] == before_execution["customFields"]
        assert ticket["progress"] == 75
        request(f"/projects/{pid}/issues/{ticket['id']}", {**before_execution, "title": "Stale ticket draft"}, owner, method="PUT", expected=409)
        assert request(f"/projects/{pid}/issues/{ticket['id']}", token=owner) == ticket
        request(f"/projects/{pid}", {"name": "Field policy", "archived": True}, owner, method="PUT")
        request(f"/projects/{pid}/issues/{ticket['id']}", {**ticket, "customFields": {"risk_note": "Archived edit"}}, owner, method="PUT", expected=409)
        assert request(f"/projects/{pid}/issues/{ticket['id']}", token=owner) == ticket
        print("Ticket field API acceptance passed: policy roles and isolation, protected fields, immutable IDs/types, required plan vs execution, 0/null/date validation, hidden and retired value preservation, legacy requests, policy/ticket conflicts, archived read-only")
    finally:
        for workspace_id, name in ((wid, workspace_name), (other_wid, other_name)):
            if workspace_id is not None:
                request(f"/auth/workspaces/{workspace_id}", {"confirmation": name}, owner, method="DELETE")


if __name__ == "__main__":
    main()
