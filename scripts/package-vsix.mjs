import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

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

// 4. Create .vsix zip archive
const outVsix = path.join(rootDir, `${pkg.name}-${pkg.version}.vsix`);
if (fs.existsSync(outVsix)) {
  fs.unlinkSync(outVsix);
}

execFileSync('zip', ['-r', '-q', outVsix, '[Content_Types].xml', 'extension.vsixmanifest', 'extension'], {
  cwd: stageDir,
});

fs.rmSync(stageDir, { recursive: true, force: true });
console.log(`VSIX créé avec succès : ${outVsix}`);
