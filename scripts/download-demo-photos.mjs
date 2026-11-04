import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
const photos = [
  ['moambe', 36982103],
  ['poisson', 37534683],
  ['samossas', 28075291],
  ['bissap', 34566505],
  ['restaurant', 17294748],
];
for (const [name, id] of photos) {
  const response = await fetch(
    `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1400`,
  );
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  const buffer = await sharp(Buffer.from(await response.arrayBuffer()))
    .rotate()
    .resize(1200, 900, { fit: 'cover' })
    .webp({ quality: 82 })
    .toBuffer();
  await writeFile(`frontend/public/assets/${name}.webp`, buffer);
  console.log(name, buffer.length);
}
