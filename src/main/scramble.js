// Light scrambling for the daily quotes, so they can't be read ahead of time by opening
// assets/quotes.json in the public repo. Not encryption: it only keeps the surprise.
const KEY = Buffer.from('desk-companion:sunil');

function xor(bytes) {
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= KEY[i % KEY.length];
  return bytes;
}

const scramble = (text) => xor(Buffer.from(text, 'utf8')).toString('base64');
const unscramble = (encoded) => xor(Buffer.from(encoded, 'base64')).toString('utf8');

module.exports = { scramble, unscramble };
