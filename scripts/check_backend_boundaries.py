"""Check Arc's package boundaries without requiring a running database."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "backend/src/main/kotlin/io/arcapp/backend"
PREFIX = "io.arcapp.backend."
INFRASTRUCTURE = {"bootstrap", "shared"}
errors = []
dependencies = {}

for path in sorted(SOURCE.rglob("*.kt")):
    relative = path.relative_to(SOURCE)
    parts = relative.parts
    text = path.read_text()
    expected = "io.arcapp.backend" + ("." + ".".join(parts[:-1]) if len(parts) > 1 else "")
    package = re.search(r"^package ([\w.]+)$", text, re.MULTILINE)
    if not package or package[1] != expected:
        errors.append(f"{relative}: package must match directory {expected}")
    if len(parts) == 1:
        if path.name != "ArcBackendApplication.kt":
            errors.append(f"{relative}: feature code must live in a module")
        continue
    module = parts[0]
    is_web = "web" in parts or module == "bootstrap"
    is_persistence = "persistence" in parts or module == "bootstrap"
    if module not in INFRASTRUCTURE:
        dependencies.setdefault(module, set())
        if parts[1] not in {"api", "internal", "web"}:
            errors.append(f"{relative}: use api, internal, or web within a feature")
    imports = re.findall(r"^import ([\w.*]+)", text, re.MULTILINE)
    for imported in imports:
        if imported.startswith(PREFIX):
            target_parts = imported[len(PREFIX):].split(".")
            target = target_parts[0]
            if target != module and target not in INFRASTRUCTURE:
                if len(target_parts) < 2 or target_parts[1] != "api":
                    errors.append(f"{relative}: cross-module import requires {target}.api: {imported}")
                if module == "shared":
                    errors.append(f"{relative}: shared must not depend on a feature")
                if module not in INFRASTRUCTURE:
                    dependencies[module].add(target)
            if "web" in parts and ".persistence." in imported:
                errors.append(f"{relative}: controller must call a service, not persistence")
        if imported.startswith("jakarta.servlet.") and not is_web:
            errors.append(f"{relative}: servlet types belong in web or bootstrap")
        if imported.startswith(("org.springframework.jdbc.", "org.jetbrains.exposed.")) and not is_persistence:
            errors.append(f"{relative}: database access belongs in internal/persistence")
        if imported.startswith("org.springframework.web.bind.annotation.") and not is_web:
            errors.append(f"{relative}: HTTP annotations belong in web")
    if not is_persistence and re.search(r'"(?:SELECT|INSERT INTO|UPDATE|DELETE FROM) ', text):
        errors.append(f"{relative}: SQL belongs in persistence")

def visit(module, trail):
    if module in trail:
        errors.append("module dependency cycle: " + " -> ".join([*trail, module]))
        return
    for target in sorted(dependencies.get(module, ())):
        visit(target, [*trail, module])

for module in sorted(dependencies):
    visit(module, [])

if errors:
    print("\n".join(sorted(set(errors))), file=sys.stderr)
    sys.exit(1)
print(f"Backend boundaries OK: {len(dependencies)} feature modules; no dependency cycles")
