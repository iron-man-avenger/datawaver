import os

def search(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != '.venv']
        for name in filenames:
            if not name.endswith('.py'):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    for i, line in enumerate(f, 1):
                        if 'role' in line and any(keyword in line.lower() for keyword in ('select', 'insert', 'update', 'delete')):
                            print(f"{path}:{i}: {line.strip()}")
            except Exception as e:
                print(f"error reading {path}: {e}")

if __name__ == '__main__':
    search(os.path.join(os.path.dirname(__file__), '..'))
