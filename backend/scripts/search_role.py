import os

def search(root, substring):
    for dirpath, dirnames, filenames in os.walk(root):
        for name in filenames:
            if not name.endswith('.py'):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    for i, line in enumerate(f, 1):
                        if substring in line:
                            clean_line = line.strip().replace('\t', ' ')
                            print(f"{path}:{i}: {clean_line}")
            except Exception as e:
                print(f"error reading {path}: {e}")

if __name__ == '__main__':
    search(os.path.join(os.path.dirname(__file__), '..'), 'role')
