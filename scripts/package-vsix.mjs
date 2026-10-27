import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const rootDir = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));

const stageDir = path.join(rootDir, '.vsix-stage');
const extDir = path.join(stageDir, 'extension');

if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
fs.mkdirSync(extDir, { recursive: true });

// 1. [Content_Types].xml
const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".map" ContentType="application/json"/>
  <Default Extension=".css" ContentType="text/css"/>
  <Default Extension=".html" ContentType="text/html"/>
  <Default Extension=".md" ContentType="text/markdown"/>
  <Default Extension=".yaml" ContentType="text/yaml"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>`;
fs.writeFileSync(path.join(stageDir, '[Content_Types].xml'), contentTypesXml, 'utf-8');

// 2. extension.vsixmanifest
const vsixManifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}" />
    <DisplayName>${pkg.displayName}</DisplayName>
    <Description xml:space="preserve">${pkg.description}</Description>
    <Tags>architecture,markdown,yaml,diagram,wysiwyg,aws,azure</Tags>
    <Categories>${(pkg.categories || ['Other']).join(',')}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${pkg.engines.vscode}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui,workspace" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true" />
  </Assets>
</PackageManifest>`;
fs.writeFileSync(path.join(stageDir, 'extension.vsixmanifest'), vsixManifest, 'utf-8');

// 3. Copy extension files
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(extDir, 'package.json'));
fs.copyFileSync(path.join(rootDir, 'README.md'), path.join(extDir, 'README.md'));
fs.copyFileSync(path.join(rootDir, 'LICENSE'), path.join(extDir, 'LICENSE'));
fs.cpSync(path.join(rootDir, 'dist'), path.join(extDir, 'dist'), { recursive: true });
fs.cpSync(path.join(rootDir, 'resources'), path.join(extDir, 'resources'), { recursive: true });

// 4. Create .vsix zip archive (ZIP écrit en Node pur, sans dépendre du binaire `zip`)
const outVsix = path.join(rootDir, `${pkg.name}-${pkg.version}.vsix`);
if (fs.existsSync(outVsix)) {
  fs.unlinkSync(outVsix);
}

// Table CRC-32 (polynôme standard ZIP)
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Collecte récursive des fichiers du stage avec chemins relatifs (séparateurs `/`)
function collectFiles(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...collectFiles(abs, rel));
    } else {
      out.push({ name: rel, data: fs.readFileSync(abs) });
    }
  }
  return out;
}

const files = collectFiles(stageDir);
const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of files) {
  const nameBuf = Buffer.from(file.name, 'utf-8');
  const crc = crc32(file.data);
  const compressed = zlib.deflateRawSync(file.data);
  const useDeflate = compressed.length < file.data.length;
  const method = useDeflate ? 8 : 0; // 8 = deflate, 0 = stored
  const payload = useDeflate ? compressed : file.data;
  const flags = 0x0800; // bit 11 : noms de fichiers en UTF-8

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0); // signature local file header
  localHeader.writeUInt16LE(20, 4); // version nécessaire
  localHeader.writeUInt16LE(flags, 6);
  localHeader.writeUInt16LE(method, 8);
  localHeader.writeUInt16LE(0, 10); // heure
  localHeader.writeUInt16LE(0, 12); // date
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(payload.length, 18); // taille compressée
  localHeader.writeUInt32LE(file.data.length, 22); // taille non compressée
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28); // longueur extra
  localParts.push(localHeader, nameBuf, payload);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0); // signature central directory
  centralHeader.writeUInt16LE(20, 4); // version créateur
  centralHeader.writeUInt16LE(20, 6); // version nécessaire
  centralHeader.writeUInt16LE(flags, 8);
  centralHeader.writeUInt16LE(method, 10);
  centralHeader.writeUInt16LE(0, 12); // heure
  centralHeader.writeUInt16LE(0, 14); // date
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(payload.length, 20);
  centralHeader.writeUInt32LE(file.data.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30); // longueur extra
  centralHeader.writeUInt16LE(0, 32); // longueur commentaire
  centralHeader.writeUInt16LE(0, 34); // n° disque
  centralHeader.writeUInt16LE(0, 36); // attributs internes
  centralHeader.writeUInt32LE(0, 38); // attributs externes
  centralHeader.writeUInt32LE(offset, 42); // offset du local header
  centralParts.push(centralHeader, nameBuf);

  offset += localHeader.length + nameBuf.length + payload.length;
}

const centralDir = Buffer.concat(centralParts);
const localData = Buffer.concat(localParts);

const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); // signature End Of Central Directory
eocd.writeUInt16LE(0, 4); // n° disque
eocd.writeUInt16LE(0, 6); // disque du central directory
eocd.writeUInt16LE(files.length, 8); // entrées sur ce disque
eocd.writeUInt16LE(files.length, 10); // entrées totales
eocd.writeUInt32LE(centralDir.length, 12); // taille central directory
eocd.writeUInt32LE(localData.length, 16); // offset central directory
eocd.writeUInt16LE(0, 20); // longueur commentaire

fs.writeFileSync(outVsix, Buffer.concat([localData, centralDir, eocd]));

fs.rmSync(stageDir, { recursive: true, force: true });
console.log(`VSIX créé avec succès : ${outVsix}`);
