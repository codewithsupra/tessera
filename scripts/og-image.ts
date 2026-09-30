/**
 * Renders public/og.png (1200×630), the link preview for social sites and chat apps.
 * Run: npx tsx scripts/og-image.ts
 */
import sharp from 'sharp'

const W = 1200
const H = 630
const ink = '#E4E7EE'
const soft = '#A9B1C1'
const bg = '#0E1420'

// A 4×4 mosaic on the right, echoing the landing page.
const tiles: [number, number, number, number, string][] = [
  [0, 0, 2, 2, '#1B2436'],
  [2, 0, 1, 1, '#7D9FD8'],
  [3, 0, 1, 1, '#1B2436'],
  [2, 1, 2, 2, '#1B2436'],
  [0, 2, 1, 1, '#62B3A0'],
  [1, 2, 1, 1, '#1B2436'],
  [0, 3, 2, 1, '#1B2436'],
  [2, 3, 1, 1, '#CFAA5C'],
  [3, 3, 1, 1, '#151D2C'],
]
const cell = 92
const gap = 10
const ox = 760
const oy = 120
const mosaic = tiles
  .map(([c, r, w, h, fill]) => `<rect x="${ox + c * (cell + gap)}" y="${oy + r * (cell + gap)}" width="${w * cell + (w - 1) * gap}" height="${h * cell + (h - 1) * gap}" rx="12" fill="${fill}" stroke="#243047"/>`)
  .join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <g transform="translate(72 72)">
    <rect width="56" height="56" rx="12" fill="${ink}"/>
    <rect x="11" y="11" width="15" height="15" rx="3" fill="${bg}"/>
    <rect x="30" y="11" width="15" height="15" rx="3" fill="#7D9FD8"/>
    <rect x="11" y="30" width="15" height="15" rx="3" fill="#62B3A0"/>
    <rect x="30" y="30" width="15" height="15" rx="3" fill="${bg}"/>
    <text x="74" y="40" font-family="Georgia, serif" font-size="34" font-weight="700" fill="${ink}">Tessera</text>
  </g>
  <text font-family="Georgia, serif" font-size="62" fill="${ink}" letter-spacing="-1">
    <tspan x="72" y="262">Your notes stay yours.</tspan>
    <tspan x="72" y="338">Your team still writes</tspan>
    <tspan x="72" y="414">with you.</tspan>
  </text>
  <text x="72" y="486" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="${soft}">Local-first notes that sync live and export to Markdown.</text>
  <text x="72" y="566" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#8D97A9">tessera-notes.vercel.app</text>
  ${mosaic}
</svg>`

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og.png')
const meta = await sharp('public/og.png').metadata()
console.log(`public/og.png ${meta.width}×${meta.height}`)
