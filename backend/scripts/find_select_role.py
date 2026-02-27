import os
from pathlib import Path

def main():
    root = Path(__file__).resolve().parent.parent
    for path in root.rglob('*.py'):
        if '.venv' in path.parts:
            continue
        with path.open(encoding='utf-8') as f:
            for i, line in enumerate(f, 1):
                stripped = line.strip().lower()
                if stripped.startswith('select') and 'role' in stripped:
                    print(f"{path.relative_to(root)}:{i}: {line.strip()}")

if __name__ == '__main__':
    main()
