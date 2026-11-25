# 업데이트 파일 만들기: python tools/mkzip.py <출력폴더> <파일이름.zip> <안내문.txt>
#  · site · sql · installer/install.ps1 · 설치하기.bat · 업데이트하기.bat 를 묶음 (site/js/config.js 는 빼기 — 회사 연결 정보)
import zipfile, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out, name, note = sys.argv[1], sys.argv[2], sys.argv[3]
if not name.endswith('.zip'): name += '.zip'
path = os.path.join(out, name); z = zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED)
for d in ['site', 'sql']:
    for dp, dn, fn in os.walk(os.path.join(root, d)):
        for f in fn:
            full = os.path.join(dp, f); rel = os.path.relpath(full, root).replace('\\', '/')
            if rel == 'site/js/config.js': continue
            z.write(full, rel)
z.write(os.path.join(root, 'installer', 'install.ps1'), 'installer/install.ps1')
for b in ['설치하기.bat', '업데이트하기.bat']: z.write(os.path.join(root, b), b)
z.writestr('읽어보기.txt', open(note, encoding='utf-8').read().replace('\r\n', '\n').replace('\n', '\r\n'))
z.close(); print(name, len(zipfile.ZipFile(path).namelist()), os.path.getsize(path) // 1024, 'KB')
