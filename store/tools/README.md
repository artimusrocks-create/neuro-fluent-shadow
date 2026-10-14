# Regenerate the store graphics

Run from this folder after the app's look changes (needs the repo's `npm install` first):

```bash
npm i --no-save @fontsource/unbounded@5 @fontsource/onest@5 --prefix .   # fonts used on the graphics
node shots-live.mjs     # phone screenshots of the LIVE app in Google Play mode → raw/
node render.mjs         # captions from ../listing-ru.txt → ../screenshots/*.png and ../feature-graphic.png
```

Then convert to 24-bit PNG (Play rejects transparency): `python3 -c "from PIL import Image;import glob;[Image.open(p).convert('RGB').save(p) for p in glob.glob('../screenshots/*.png')+['../feature-graphic.png']]"`
