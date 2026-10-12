"""Phase 1 milestone HTTP acceptance on real MySQL/Mailpit, with isolated fixtures."""
from concurrent.futures import ThreadPoolExecutor
import json
import urllib.error
import urllib.request
import uuid
from smoke import API, account, mail_token, request


def main():
    suffix = uuid.uuid4().hex[:10]
    password = 'milestone-smoke-password-123'
    people = {}
    for name in ('owner', 'admin', 'manager', 'member', 'outsider'):
        email = f'milestone-{name}-{suffix}@example.com'
        token = account(email, password)
        people[name] = (token, request('/auth/me', token=token)['id'], email)
    owner, owner_id, _ = people['owner']
    admin, _, admin_email = people['admin']
    manager, manager_id, manager_email = people['manager']
    member, member_id, member_email = people['member']
    outsider, outsider_id, _ = people['outsider']
    name = f'Milestone {suffix}'
    wid = request('/auth/workspaces', {'name': name}, owner)['id']
    other_name = f'Foreign milestone {suffix}'
    other_wid = request('/auth/workspaces', {'name': other_name}, outsider)['id']
    try:
        for token, email, role in ((admin, admin_email, 'ADMIN'), (manager, manager_email, 'MEMBER'), (member, member_email, 'MEMBER')):
            request(f'/auth/workspaces/{wid}/invitations', {'email': email, 'role': role}, owner)
            request('/auth/invitations/accept?token=' + mail_token(email, 'arcat 팀 초대'), token=token, method='POST')
        pid = request(f'/workspaces/{wid}/projects', {'name': 'Milestones', 'key': 'MILE'}, owner)['id']
        child = request(f'/workspaces/{wid}/projects', {'name': 'Child', 'key': 'CHILD', 'parentProjectId': pid}, owner)['id']
        sibling = request(f'/workspaces/{wid}/projects', {'name': 'Sibling', 'key': 'SIB'}, owner)['id']
        foreign = request(f'/workspaces/{other_wid}/projects', {'name': 'Foreign', 'key': 'OTHER'}, outsider)['id']
        version = request(f'/projects/{pid}/versions', {'name': 'v1', 'startDate': '2026-10-01', 'dueDate': '2026-10-31'}, owner)['id']
        foreign_version = request(f'/projects/{sibling}/versions', {'name': 'foreign', 'dueDate': '2026-10-31'}, owner)['id']
        issue = request(f'/projects/{pid}/issues', {'title': 'Preserved ticket', 'type': 'TASK', 'assigneeId': member_id, 'versionId': version, 'startDate': '2026-10-03', 'dueDate': '2026-10-12'}, owner)
        issue_before = request(f'/projects/{pid}/issues/{issue["id"]}', token=owner)
        versions_before = request(f'/projects/{pid}/versions', token=owner)
        path = f'/projects/{pid}/milestones'
        base = {'title': '  독립 목표  ', 'targetDate': '2024-02-29', 'criteria': '  검증\n완료  ', 'description': '설명\n"quoted"'}
        request(path, base, member, expected=403)
        request(path, base, manager, expected=403)
        request(path, token=outsider, expected=403)
        request(f'/projects/{foreign}/milestones', token=owner, expected=403)
        for field, value in (('title', None), ('title', ' '), ('title', 'a'*121), ('criteria', None), ('criteria', ' '), ('criteria', 'a'*10001), ('description', 'a'*10001), ('targetDate', None), ('targetDate', '2025-02-29'), ('targetDate', '2026-02-31'), ('targetDate', '2026-2-01'), ('targetDate', '0999-12-31'), ('targetDate', '10000-01-01'), ('versionId', foreign_version), ('ownerId', outsider_id)):
            error = request(path, {**base, field: value}, owner, expected=400)
            assert error['code'] == 'VALIDATION_FAILED' and field in error['fieldErrors'], error
        assert request(path, token=owner)['total'] == 0
        m = request(path, {**base, 'ownerId': member_id, 'status': 'ACHIEVED', 'revision': 99, 'actorId': outsider_id, 'projectId': foreign}, owner)
        assert m['status'] == 'PLANNED' and m['revision'] == 0 and m['projectId'] == pid
        assert m['title'] == '독립 목표' and m['criteria'] == '검증\n완료'
        detail = path + f'/{m["id"]}'
        hist = detail + '/activities'
        def get(): return request(detail, token=owner)
        def history(): return request(hist, token=owner)
        def edit(value=None, **extras):
            value = value or get()
            return {key: value[key] for key in ('title', 'targetDate', 'criteria', 'description', 'ownerId', 'versionId', 'revision')} | extras
        def rejected(route, body, status=400, field=None, method=None, token=owner):
            before, events = get(), history()
            error = request(route, body, token, method=method, expected=status)
            if field: assert error['code'] == 'VALIDATION_FAILED' and field in error['fieldErrors'], error
            assert get() == before and history() == events, 'Rejected request wrote metadata/history'
            return error
        assert request(detail, token=member) == m
        assert request(hist, token=member)['total'] == 1
        payload = history()['items'][0]['payload']
        assert payload['schemaVersion'] == 1 and payload['before'] is None and payload['previousRevision'] is None
        assert payload['after']['targetDate'] == '2024-02-29' and payload['after']['ownerId'] == member_id
        assert history()['items'][0]['actorId'] == owner_id and history()['items'][0]['createdAt'].endswith('Z')
        for revision in ('missing', None, -1):
            body = edit()
            if revision == 'missing': body.pop('revision')
            else: body['revision'] = revision
            rejected(detail, body, field='revision', method='PUT')
            for action in ('cancel', 'reopen'):
                rejected(detail+'/'+action, {'reason': '사유'} | ({} if revision == 'missing' else {'revision': revision}), field='revision')
        for field in ('title', 'criteria', 'targetDate'):
            for omit in (True, False):
                body = edit()
                if omit: body.pop(field)
                else: body[field] = None
                rejected(detail, body, field=field, method='PUT')
        rejected(detail, edit(targetDate='2026-10-20'), field='reason', method='PUT')
        rejected(detail, edit(reason='a'*1001), field='reason', method='PUT')
        rejected(detail+'/cancel', {'revision': 0, 'reason': ' '}, field='reason')
        rejected(detail+'/cancel', {'revision': 0, 'reason': 'a'*1001}, field='reason')
        rejected(detail, edit(), status=403, method='PUT', token=member)
        # Assignment supplies no management capability.
        rejected(detail+'/cancel', {'revision': 0, 'reason': '사유'}, status=403, token=member)
        request(f'/projects/{pid}/managers/{manager_id}', token=owner, method='PUT')
        request(f'/projects/{child}/milestones', base, manager, expected=403)
        shared1 = request(path, {**base, 'versionId': version}, manager)
        shared2 = request(path, {**base, 'versionId': version, 'targetDate': '9999-12-31'}, admin)
        assert shared1['versionId'] == shared2['versionId'] == version
        m = request(detail, edit(targetDate='1000-01-01', reason='일정 조정', versionId=version), manager, method='PUT')
        assert m['revision'] == 1 and m['targetDate'] == '1000-01-01'
        stale = rejected(detail, edit(revision=0), status=409, method='PUT')
        assert stale['code'] == 'MILESTONE_CHANGED'
        # Departed owner survives unchanged metadata, status, and typed history.
        request(f'/auth/workspaces/{wid}/members/{member_id}', token=owner, method='DELETE')
        m = request(detail, edit(title='담당자 유지'), owner, method='PUT')
        assert m['ownerId'] == member_id
        request(detail, token=member, expected=403)
        m = request(detail, edit(description=None, ownerId=None, versionId=None), admin, method='PUT')
        assert all(m[k] is None for k in ('description', 'ownerId', 'versionId'))
        rejected(detail, edit(ownerId=member_id), field='ownerId', method='PUT')
        m = request(detail+'/cancel', {'revision': m['revision'], 'reason': '  중단  '}, manager)
        assert m['status'] == 'CANCELLED'
        rejected(detail, edit(), status=409, method='PUT')
        rejected(detail+'/cancel', {'revision': m['revision'], 'reason': '중단'}, status=409)
        rejected(detail+'/reopen', {'revision': m['revision'], 'reason': None}, field='reason')
        m = request(detail+'/reopen', {'revision': m['revision'], 'reason': '재개'}, admin)
        assert m['status'] == 'PLANNED'
        rejected(detail+'/reopen', {'revision': m['revision'], 'reason': '재개'}, status=409)
        # Wrong authorized project paths are uniformly 404.
        wrong = f'/projects/{sibling}/milestones/{m["id"]}'
        for route, method, body in ((wrong, 'GET', None), (wrong, 'PUT', edit()), (wrong+'/cancel', 'POST', {'revision': m['revision'], 'reason': '중단'}), (wrong+'/reopen', 'POST', {'revision': m['revision'], 'reason': '재개'}), (wrong+'/activities', 'GET', None)):
            request(route, body, owner, method=method, expected=404)
        request(f'/projects/{pid}/managers/{manager_id}', token=owner, method='DELETE')
        rejected(detail, edit(), status=403, method='PUT', token=manager)
        # Same-revision edit and edit/cancel races append exactly one event.
        def race(routes):
            before, events = get(), history()['total']
            def send(item):
                route, body, method = item
                req = urllib.request.Request(API+route, data=json.dumps(body).encode(), headers={'Content-Type':'application/json','Authorization':'Bearer '+owner}, method=method)
                try:
                    with urllib.request.urlopen(req, timeout=30) as response: return response.status, json.load(response)
                except urllib.error.HTTPError as e: return e.code, json.load(e)
            with ThreadPoolExecutor(max_workers=2) as pool: responses = list(pool.map(send, routes(before)))
            assert sorted(code for code, _ in responses) == [200,409], responses
            assert next(body for code, body in responses if code == 409)['code'] == 'MILESTONE_CHANGED'
            assert get()['revision'] == before['revision']+1 and history()['total'] == events+1
        race(lambda before: [(detail,edit(before,title='동시 A'),'PUT'),(detail,edit(before,title='동시 B'),'PUT')])
        race(lambda before: [(detail,edit(before,title='편집 경합'),'PUT'),(detail+'/cancel',{'revision':before['revision'],'reason':'취소 경합'},'POST')])
        if get()['status'] == 'CANCELLED': request(detail+'/reopen', {'revision':get()['revision'],'reason':'계속'},owner)
        listing = request(path+'?page=0&size=2',token=manager)
        second = request(path+'?page=1&size=2',token=manager)
        assert listing['total'] == 3 and len(listing['items']) == 2 and len(second['items']) == 1
        all_items = request(path+'?size=1000',token=owner)
        assert all_items['size'] == 100 and [(i['targetDate'],i['id']) for i in all_items['items']] == sorted((i['targetDate'],i['id']) for i in all_items['items'])
        assert request(path+'?page=-1&size=0',token=owner)['page'] == 0
        assert request(path+'?page=2147483647&size=100',token=owner)['items'] == []
        events = request(hist+'?size=1000',token=owner)
        assert events['size'] == 100 and [i['id'] for i in events['items']] == sorted((i['id'] for i in events['items']),reverse=True)
        assert request(hist+'?page=1&size=2',token=owner)['items'] == events['items'][2:4]
        for event in events['items']:
            payload = event['payload']
            assert payload['schemaVersion'] == 1 and payload['revision'] == payload['after']['revision']
            assert set(payload['after']) == {'title','targetDate','criteria','description','ownerId','versionId','status','revision'}
            assert event['actorName'] and event['createdAt'].endswith('Z')
        assert any(i['payload']['after']['ownerId'] == member_id for i in events['items'])
        request(f'/projects/{pid}', {'name':'Milestones','archived':True},owner,method='PUT')
        assert get() and history()
        rejected(path,base,status=409)
        rejected(detail,edit(),status=409,method='PUT')
        for action in ('cancel','reopen'): rejected(detail+'/'+action,{'revision':get()['revision'],'reason':'사유'},status=409)
        assert request(f'/projects/{pid}/issues/{issue["id"]}',token=owner) == issue_before
        assert request(f'/projects/{pid}/versions',token=owner) == versions_before
        print('Milestone smoke passed: seven operations, nullable HTTP revision, field validation, dates, typed history, roles, scoped managers, no owner rights, departure, links, null clearing, state, archive, isolation, paging and two concurrency races; existing issue/version preserved')
    finally:
        request(f'/auth/workspaces/{wid}', {'confirmation':name},owner,method='DELETE')
        request(f'/auth/workspaces/{other_wid}', {'confirmation':other_name},outsider,method='DELETE')


if __name__ == '__main__': main()
