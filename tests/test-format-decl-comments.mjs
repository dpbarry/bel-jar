import assert from 'node:assert/strict';
import { parser } from '../js/editor-src/beluga-parser.js';
import { formatString } from '../js/editor-src/format/document-format.mjs';

const schemaSrc = `schema s = % note
block (x:tm) ;
`;
const typedefSrc = `typedef t : ctype = % note
nat ;
`;

const schemaOut = formatString(schemaSrc, parser.parse(schemaSrc));
const typedefOut = formatString(typedefSrc, parser.parse(typedefSrc));

assert.ok(schemaOut.includes('% note'), 'schema inline comment preserved');
assert.ok(schemaOut.includes('block (x:tm)'), 'schema body preserved');

assert.ok(typedefOut.includes('% note'), 'typedef comment preserved');
assert.ok(typedefOut.includes('nat'), 'typedef body preserved');

console.log('OK format decl comments');
