"""Verify a CSS-only release updates an installed SW and survives offline reload."""
import functools, http.server, pathlib, re, shutil, socketserver, subprocess, sys, tempfile, threading
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
base = pathlib.Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='bar-css-update-') as td:
    task = pathlib.Path(td)
    shutil.copytree(root / 'src', task / 'src')
    shutil.copy2(root / 'build.sh', task / 'build.sh')
    shell = task / 'src/app-shell.html'
    shell.write_text(shell.read_text().replace('</style>', ':root{--release-probe:updated}\n</style>'))
    updated = task / 'candidate'
    subprocess.run(['bash', str(task / 'build.sh'), '--stage', str(updated)], check=True, stdout=subprocess.DEVNULL)
    version = lambda p: re.search(r"register\('/sw.js\?v=([a-f0-9]+)", (p/'index.html').read_text()).group(1)
    old_v, new_v = version(base), version(updated)
    assert old_v != new_v, 'CSS-only edit did not change SW registration URL'
    current = [base]
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(current[0]), **kwargs)
        def log_message(self, *args): pass
    with socketserver.TCPServer(('127.0.0.1', 0), Handler) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        url = 'http://127.0.0.1:' + str(server.server_address[1])
        with sync_playwright() as pw:
            br = pw.chromium.launch()
            ctx = br.new_context()
            pg = ctx.new_page()
            pg.goto(url, wait_until='networkidle')
            pg.evaluate('navigator.serviceWorker.ready')
            pg.wait_for_function('navigator.serviceWorker.controller !== null')
            current[0] = updated
            pg.reload(wait_until='networkidle')
            pg.wait_for_function('(v) => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.includes(v)', arg=new_v)
            ctx.set_offline(True)
            pg.reload(wait_until='domcontentloaded')
            assert pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--release-probe').trim()") == 'updated'
            pg.click('.tile[data-go="p24"]')
            for n in [1,2,3,4]: pg.click(f'#pad button[data-v="{n}"]')
            assert '= 24' in pg.inner_text('.vact')
            ctx.close(); br.close()
        server.shutdown()
print('PWA update: 3 passed (CSS changes version; installed SW updates; offline new CSS and calculation)')
