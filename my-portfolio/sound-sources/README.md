# Sound sources

The original `.wav` recordings. They are **not** under `static/` on purpose:
Vite copies that folder into the build verbatim, so leaving them there would
ship 2.6 MB of masters next to the 183 KB the browser actually downloads.

Each one is encoded to the pair the game loads, matching the existing beds:

`menu/open.wav` is kept as a source but is **not** encoded: opening and
closing a panel now share `menu/close.wav`, because the longer open flourish
read as an event of its own beside the short close tick and made the two
halves of one gesture feel unrelated.

| use | channels | Opus (webm) | AAC (m4a) |
|---|---|---|---|
| footsteps | mono | 40 kbps | 64 kbps |
| UI, throw, ball | mono | 56 kbps | 80 kbps |
| score stingers | stereo | 72 kbps | 112 kbps |

```sh
ffmpeg -i in.wav -ac <1|2> -c:a libopus -b:a <rate> -vbr on -application audio out.webm
ffmpeg -i in.wav -ac <1|2> -c:a aac    -b:a <rate> -movflags +faststart      out.m4a
```

Two formats because no single one is safe everywhere: Opus is smaller and
Chrome/Firefox take it, Safari needs the AAC. Howler picks the first the
browser reports it can play, so only ONE of the two is ever downloaded.
