#!/usr/bin/env python3
"""Build the product photo chapters from verified, original 1920×1080 captures."""
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRODUCT = ROOT / 'docs/product'
CHAPTERS = {
    '01-team-and-access': ('팀 공간 시작하기', '집배원 고양이가 안내하는 로그인·가입 화면에서 시작합니다. 이메일 확인을 거쳐 첫 워크스페이스를 준비하거나 팀 초대를 수락하고, 함께 일할 프로젝트를 선택합니다.'),
    '02-planning-and-schedule': ('WBS와 일정 계획', '관리자는 WBS로 범위와 배정을 정하고, 개발자는 내 업무와 팀 진척을 함께 봅니다. 같은 티켓을 간트와 타임라인에서 일정으로 확인합니다.'),
    '03-tickets-and-views': ('티켓 실행과 협업', 'Epic·Story·Task·Bug·하위 작업은 공통 티켓의 유형입니다. 테이블·칸반·상세는 같은 티켓을 표시하며, 계획 변경과 담당 업무 실행 권한을 구분합니다. 팀이 정한 추가 정보와 필수 조건은 티켓 생성·계획 편집에 함께 적용합니다.'),
    '04-sprints': ('백로그와 스프린트', '관리자는 백로그와 스프린트를 편성하고, 담당자는 진행 중 업무를 수행합니다. 종료 시 미완료 업무를 이월하고 당시 결과를 보존합니다.'),
    '05-settings-and-integrations': ('설정과 개발 도구 연동', '프로젝트 관리 범위와 팀 역할, 워크스페이스 티켓 필드를 설정하고 GitHub·GitLab 개발 활동을 티켓에 연결합니다. 빈 프로젝트와 보관 프로젝트의 동작도 확인합니다.'),
}


def main():
    manifest = json.loads((PRODUCT / 'screenshots.json').read_text())
    shots = manifest['screenshots']
    assert len({shot['id'] for shot in shots}) == len(shots), 'Duplicate screenshot IDs'
    expected = set()
    for shot in shots:
        assert shot['chapter'] in CHAPTERS, 'Unknown photo chapter'
        assert shot['file'] == f"{shot['id']}.png", 'Unexpected photo filename'
        file = PRODUCT / 'images' / shot['file']
        raw = file.read_bytes()
        assert raw[:8] == b'\x89PNG\r\n\x1a\n', f'Invalid PNG: {file.name}'
        assert struct.unpack('>II', raw[16:24]) == (1920, 1080), f'Wrong image size: {file.name}'
        assert (shot['width'], shot['height']) == (1920, 1080)
        assert '?' not in shot['route'], 'Authentication tokens must not appear in routes'
        expected.add(file.name)
    assert expected == {file.name for file in (PRODUCT / 'images').glob('*.png')}, 'Manifest and photos differ'

    for chapter, (title, intro) in CHAPTERS.items():
        chapter_shots = [shot for shot in shots if shot['chapter'] == chapter]
        lines = [f'# {title}', '', '[제품 소개](README.md) · [전체 기능 안내](FEATURES.md)', '', intro, '',
                 f"> {manifest['capturedAt']} · Asia/Seoul · 실제 앱 촬영 · 모든 원본 1920×1080", '',
                 '사진을 누르면 원본을 볼 수 있습니다. 동일한 데모 팀의 업무 흐름을 순서대로 촬영했으며 스프린트 종료·보관 전후에는 상태가 달라집니다.', '']
        if chapter == '02-planning-and-schedule':
            lines += ['WBS 완료 비율은 말단 티켓의 완료 상태로 계산합니다. 간트 집계 완료율과 서로 다른 지표입니다. 버전 목표 날짜는 현재 제공하며, 독립 마일스톤의 달성 관리는 [후속 기획](../MILESTONE_PLAN.md)입니다.', '']
        if chapter == '05-settings-and-integrations':
            lines += ['연동 사진은 로컬 GitHub·GitLab 제공자 모형으로 저장소 확인과 서명된 웹훅을 처리한 실제 앱 화면입니다. 실제 외부 계정 연결의 증빙은 아니며, 설치 후 [연동 안내](../INTEGRATIONS.md)에 따라 설정합니다.', '']
        for shot in chapter_shots:
            lines += [f"<a id=\"{shot['id']}\"></a>", '', f"## {shot['title']}", '', shot['purpose'], '',
                      f"[![{shot['title']} — arcat 실제 제품 화면, 1920×1080](images/{shot['file']})](images/{shot['file']})", '',
                      f"**사용자:** {shot['role']} · **화면:** `{shot['route']}` · {shot['frame']}", '',
                      '이 기능에서 할 수 있는 일:', '']
            lines += [f'- {feature}' for feature in shot['features']]
            lines += ['']
        (PRODUCT / f'{chapter}.md').write_text('\n'.join(lines))
    print(f'Built {len(CHAPTERS)} chapters; verified {len(shots)} original 1920×1080 photographs.')


if __name__ == '__main__':
    main()
