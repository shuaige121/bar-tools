"""Real input, overflow and financial-control checks at narrow/landscape/tablet sizes."""
import pathlib, sys
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8789'
shots = pathlib.Path(__file__).resolve().parent.parent/'output/playwright'
shots.mkdir(parents=True,exist_ok=True)
count = 0
with sync_playwright() as pw:
    br=pw.chromium.launch()
    for w,h in [(320,568),(375,667),(667,375),(768,1024)]:
        c=br.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True)
        p=c.new_page(); errors=[]
        p.on('pageerror',lambda e:errors.append(str(e)))
        for tid in ['', 'dice','holdem','bj','p24']:
            p.goto(url+('/#'+tid if tid else '/'),wait_until='networkidle')
            if tid=='dice':
                for n in [5,5,5,1,2]:p.click(f'#pad button[data-v="{n}"]')
                p.click('#faces button[data-f="5"]');p.click('#counts button[data-c="4"]')
            elif tid=='holdem':
                for r,s in [(12,0),(12,1)]:
                    p.click(f'#hp-suits button[data-s="{s}"]');p.click(f'#hp-ranks button[data-r="{r}"]')
            elif tid=='bj':
                p.click('#up button[data-v="6"]')
                for n in [1,1]:p.click(f'#pad button[data-v="{n}"]')
            elif tid=='p24':
                for n in [3,8,3,8]:p.click(f'#pad button[data-v="{n}"]')
            assert p.evaluate('document.documentElement.scrollWidth <= innerWidth'),(w,h,tid,'overflow')
            if tid:
                assert p.locator('.vact').is_visible(),(w,h,tid,'no result')
                p.screenshot(path=str(shots/f'{w}x{h}-{tid}.png'))
                if tid!='p24':
                    p.locator('#cash').scroll_into_view_if_needed()
                    p.fill('#cash','1000' if tid=='bj' else '-10')
                    assert '净收益 −S$' in p.inner_text('#netcost'),(w,h,tid,'net return')
                    assert not p.locator('.dock').count() or p.locator('.dock').is_hidden(), 'game pad blocks money input'
                    p.screenshot(path=str(shots/f'{w}x{h}-{tid}-cost.png'))
                    p.locator('#cash').blur()
            else:
                if h>=568:
                    menu=p.locator('.menu').bounding_box()
                    assert menu['y']+menu['height']<=h,(w,h,'home tiles clipped')
                p.screenshot(path=str(shots/f'{w}x{h}-home.png'))
            count+=1
        assert not errors,errors
        c.close()
    br.close()
print(f'Responsive: {count} real flows passed at 320×568 / 375×667 / 667×375 / 768×1024')
