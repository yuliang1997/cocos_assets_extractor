import { extract } from "./webbundle_extractor"
const argv = process.argv
const input = argv[2]
extract(input)
