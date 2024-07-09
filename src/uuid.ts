import decodeUuid from "./utils/decode-uuid"
const argv = process.argv
const input = argv[2]
console.log(decodeUuid(input))
