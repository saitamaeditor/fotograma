import sys, pathlib
svg = pathlib.Path('emblema.svg').read_text(encoding='utf-8')
fondo, escala, salida = sys.argv[1], float(sys.argv[2]), sys.argv[3]
bg = {
  'icono': "background: radial-gradient(circle at 50% 42%, #3a0509 0%, #14020a 45%, #050507 100%);",
  'nada': "background: transparent;",
}[fondo]
html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:1024px;height:1024px;overflow:hidden;{bg}}}
div{{position:absolute;inset:0;display:grid;place-items:center}}
svg{{width:{1024*escala}px;height:{1024*escala}px}}
</style></head><body><div>{svg}</div></body></html>"""
pathlib.Path(salida).write_text(html, encoding='utf-8')
