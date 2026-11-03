// lib/messageTemplate.js
// Message personalisation shared by the browser preview and the sender.
//
//   {{number}}            -> recipient number
//   {Hi|Hello|Hey}        -> one option picked at random (spintax, nestable)

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/gi;
const SPIN = /\{([^{}]*\|[^{}]*)\}/;

export function renderTemplate(text, variables = {}, random = Math.random) {
  let output = String(text || '').replace(VARIABLE, (match, name) => {
    const value = variables[name.toLowerCase()];
    return value == null ? match : String(value);
  });

  // Resolve innermost groups first so nested spintax works. The guard stops
  // pathological input from looping forever.
  for (let guard = 0; guard < 500; guard += 1) {
    const found = SPIN.exec(output);
    if (!found) break;
    const options = found[1].split('|');
    const choice = options[Math.floor(random() * options.length)] ?? '';
    output = output.slice(0, found.index) + choice + output.slice(found.index + found[0].length);
  }

  return output;
}

export function countVariations(text) {
  let total = 1;
  const re = /\{([^{}]*\|[^{}]*)\}/g;
  let match;
  while ((match = re.exec(String(text || ''))) !== null) {
    total *= match[1].split('|').length;
    if (total > 1e6) return total;
  }
  return total;
}
