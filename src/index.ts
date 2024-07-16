import { extract, extract_bundle } from "./webbundle_extractor"
import path from "path"
const argv = process.argv
const type = argv[2]
const input = argv[3]
switch (type) {
  case "root":
    extract(input)
    break
  case "bundle":
    const name = path.basename(input)
    extract_bundle(input, name)
    break
  default:
    break
}
