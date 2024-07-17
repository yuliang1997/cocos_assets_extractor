import path from "path"
import fs from "fs"
import { IConfigOption, processOptions } from "./config"
import assert from "assert"
import decodeUuid from "./utils/decode-uuid"
import webp from "webp-converter"
import sharp from "sharp"

function fixPath(p: string) {
  return p.replaceAll("\\", "/")
}

function ensureFileNameExists(fn: string) {
  const dir = path.dirname(fn)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function findFile(
  dir: string,
  name: string,
  ext: string,
  recursion: boolean
): string | undefined {
  for (const f of fs.readdirSync(dir)) {
    const fullFilename = path.join(dir, f)
    const stat = fs.statSync(fullFilename)
    if (stat.isDirectory()) {
      if (recursion) {
        const r = findFile(fullFilename, name, ext, recursion)
        if (r) {
          return r
        }
      }
    } else {
      const parts = f.split(".")
      if (
        parts[0] == name &&
        (ext == "*" || parts[2] == ext || ext.endsWith(parts[2]))
      ) {
        return fixPath(fullFilename)
      }
    }
  }
  return undefined
}

const enum File {
  Version = 0,
  Context = 0,

  SharedUuids,
  SharedStrings,
  SharedClasses,
  SharedMasks,

  Instances,
  InstanceTypes,

  Refs,

  DependObjs,
  DependKeys,
  DependUuidIndices,

  ARRAY_LENGTH,
}

function writeJson(outBase: string, fileName: string, data: any) {
  const outConfigPath = outBase + `/${fileName}.json`
  ensureFileNameExists(outConfigPath)
  fs.writeFileSync(outConfigPath, JSON.stringify(data, undefined, 4), {
    encoding: "utf-8",
  })
}

export function extract_bundle(
  bundleRoot: string,
  bundleName: string,
  getBundleRoot?: (name: string) => string
) {
  const configPath = findFile(bundleRoot, "config", "json", false)
  console.log(`configPath:${configPath}`)
  const configJson = JSON.parse(
    fs.readFileSync(configPath!, { encoding: "utf-8" })
  ) as IConfigOption
  processOptions(configJson)
  const outBase = bundleRoot + `/../out_${bundleName}`
  writeJson(outBase, "config.out", configJson)
  for (const packId in configJson.packs) {
    const packIds = configJson.packs[packId]
    const packPath = findFile(bundleRoot + "/import", packId, "json", true)
    console.log(`packPath:${packPath}`)
    assert(packPath)
    const packJson = JSON.parse(
      fs.readFileSync(packPath, { encoding: "utf-8" })
    )
    const sharedUuids = packJson[File.SharedUuids] as string[]
    const sharedStrings = packJson[File.SharedStrings]
    const sharedClasses = packJson[File.SharedClasses]
    const sharedMasks = packJson[File.SharedMasks]
    const sections = packJson[File.Instances]
    // const unpackedPackJson = decodePack(packJson)
    for (let packIdx = 0; packIdx < packIds.length; packIdx++) {
      const uuid = packIds[packIdx]
      const pureUuid = uuid.split("@")[0]

      const entry = configJson.paths[uuid]
      if (!entry) {
        // todo atlas?
        continue
      }
      const assetPath = entry[0]
      const type = entry[1]
      switch (type) {
        case "sp.SkeletonData": {
          const isNative = configJson.versions.native.includes(uuid)
          assert(isNative)
          const section = sections[packIdx]
          const name = section[0][0][1]
          const ext = section[0][0][2]
          const atlasText = section[0][0][3]
          const textureNames = section[0][0][4]
          const textureRefIds = section[0][0][5]
          const refs = section[5]
          const tarBasePath = `${outBase}/${assetPath}`
          ensureFileNameExists(tarBasePath)

          // write skel
          const srcSkelPath = findFile(`${bundleRoot}/native/`, uuid, ext, true)
          const tarSkelPath = path.dirname(tarBasePath) + `/${name}.skel`
          fs.cpSync(srcSkelPath!, tarSkelPath)

          // write atlas
          const tarAtlasPath = path.dirname(tarBasePath) + `/${name}.atlas`
          fs.writeFileSync(tarAtlasPath, atlasText)

          // write texture
          for (let texIdx = 0; texIdx < textureRefIds.length; texIdx++) {
            const refId = textureRefIds[texIdx]
            const texName = textureNames[texIdx]
            const texExt = path.extname(texName)
            const uuid = decodeUuid(sharedUuids[refs[refId]])
            const pureUuid = uuid.split("@")[0]
            const isNative = configJson.versions.native.includes(pureUuid)
            assert(isNative)
            const srcTexPath = findFile(
              `${bundleRoot}/native/`,
              pureUuid,
              "*",
              true
            )!
            const srcTexExt = path.extname(srcTexPath)
            const tarTexPath = path.dirname(tarBasePath) + `/${texName}`
            ensureFileNameExists(tarTexPath)
            if (srcTexExt.toLowerCase() !== texExt.toLowerCase()) {
              webp.dwebp(srcTexPath, tarTexPath, "-o")
            } else {
              try {
                fs.cpSync(srcTexPath, tarTexPath)
              } catch (err) {
                console.error(err)
                console.log(`cptex err, src:${srcTexPath}, tar:${tarTexPath}`)
              }
            }
          }
          break
        }
        case "cc.SpriteFrame": {
          const section = sections[packIdx]
          const sprite = section[0][0]
          const ref = section[5][0]
          const atlasUuid = decodeUuid(sharedUuids[ref])
          const atlasPureUuid = atlasUuid.split("@")[0]
          const isNative = configJson.versions.native.includes(atlasPureUuid)
          const redirectIdx = configJson.redirect.indexOf(atlasUuid)

          let atlasPath: string | undefined
          if (redirectIdx >= 0 && getBundleRoot) {
            const redirectBundle = configJson.redirect[redirectIdx + 1]
            const rb = getBundleRoot(redirectBundle)
            atlasPath = findFile(`${rb}/native/`, atlasPureUuid, "*", true)
            console.log(
              `redirect to bundle ${redirectBundle}, sprite:${assetPath}, atlas:${atlasPath}`
            )
          } else if (!isNative) {
            continue
          } else {
            atlasPath = findFile(
              `${bundleRoot}/native/`,
              atlasPureUuid,
              "*",
              true
            )
          }
          const tarPath = path.dirname(`${outBase}/${assetPath}`) + ".png"
          // console.log(
          //   `handle sprite:${assetPath}, atlas uuid:${atlasUuid}, isNative:${isNative}, redirect:${redirectIdx}, atlasPath:${atlasPath}, tarPath:${tarPath}`
          // )
          if (atlasPath == undefined) {
            console.error(`atlas not found!, uuid:${uuid}`)
            continue
          }
          ensureFileNameExists(tarPath)
          const atlas = sharp(atlasPath)
          const width = sprite.rotated ? sprite.rect.height : sprite.rect.width
          const height = sprite.rotated ? sprite.rect.width : sprite.rect.height
          const result = atlas.clone().extract({
            left: sprite.rect.x,
            top: sprite.rect.y,
            width: width,
            height: height,
          })
          if (sprite.rotated) {
            result.rotate(-90)
          }
          if (
            sprite.rect.width !== sprite.originalSize.width &&
            sprite.rect.height !== sprite.originalSize.height
          ) {
            // 图集对原始图片进行过裁剪操作
            const margin = {
              top: Math.floor(
                (sprite.originalSize.height - sprite.rect.height) / 2 -
                  sprite.offset.y
              ),
              bottom: Math.ceil(
                (sprite.originalSize.height - sprite.rect.height) / 2 +
                  sprite.offset.y
              ),
              left: Math.ceil(
                (sprite.originalSize.width - sprite.rect.width) / 2 +
                  sprite.offset.x
              ),
              right: Math.floor(
                (sprite.originalSize.width - sprite.rect.width) / 2 -
                  sprite.offset.x
              ),
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            }
            result.extend(margin)
          }
          result.toFile(tarPath, (err, info) => {
            if (!err) {
              return
            }
            console.error(
              `extract spriteframe error, err:${err}, info:${JSON.stringify(
                info
              )},atlas:${atlasPath}, tar:${tarPath}`
            )
          })
          break
        }
        case "cc.AudioClip": {
          const isNative = configJson.versions.native.includes(uuid)
          assert(isNative)
          const section = sections[packIdx]
          const ext = section[0][0][2]
          const srcPath = findFile(`${bundleRoot}/native/`, pureUuid, "*", true)
          const tarPath = `${outBase}/${assetPath}${ext}`
          ensureFileNameExists(tarPath)
          fs.cpSync(srcPath!, tarPath)
          break
        }
        case "cc.BitmapFont": {
          const section = sections[packIdx]
          const name = section[0][0][1]
          const data = section[0][0][3]
          const fntContent: string[] = []
          fntContent.push(
            `info face="${name}" size=${data.fontSize} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=1,1,1,1 spacing=1,1`
          )
          fntContent.push(
            `common lineHeight=${data.commonHeight} base=${data.fontSize} scaleW=93 scaleH=94 pages=1 packed=0`
          )
          fntContent.push(`page id=0 file="${data.atlasName}"`)
          const chars: string[] = []
          for (const cid in data.fontDefDictionary) {
            const c = data.fontDefDictionary[cid]
            chars.push(
              `char id=${cid} x=${c.rect.x} y=${c.rect.y} width=${c.rect.width} height=${c.rect.height} xoffset=${c.xOffset} yoffset=${c.yOffset} xadvance=${c.xAdvance} page=0 chnl=15`
            )
          }
          fntContent.push(`chars count=${chars.length}`)
          fntContent.push(chars.join("\n"))
          const tarPath = `${outBase}/${assetPath}.fnt`
          ensureFileNameExists(tarPath)
          fs.writeFileSync(tarPath, fntContent.join("\n"), "utf-8")
          break
        }
        default:
          break
      }
    }
  }
}

export function extract(input: string) {
  input = fixPath(input)
  console.log(`input:${input}`)
  const settingsPath = findFile(input, "settings", "json", true)
  const settingsJson = JSON.parse(
    fs.readFileSync(settingsPath!, { encoding: "utf-8" })
  )

  function getBundleRoot(bundleName: string) {
    return input + `/assets/${bundleName}`
  }

  const bundleNames = settingsJson.assets.projectBundles
  for (const bundleName of bundleNames) {
    if (bundleNames == "internal") {
      continue
    }
    const bundleRoot = getBundleRoot(bundleName)
    extract_bundle(bundleRoot, bundleName, getBundleRoot)
  }
}
