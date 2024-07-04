const BASE64_KEYS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const values: number[] = new Array(123); // max char code in base64Keys
for (let i = 0; i < 123; ++i) {
  values[i] = 64;
} // fill with placeholder('=') index
for (let i = 0; i < 64; ++i) {
  values[BASE64_KEYS.charCodeAt(i)] = i;
}

// decoded value indexed by base64 char code
export const BASE64_VALUES = values;
