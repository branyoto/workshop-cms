import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const cmsPath = join(rootDir, 'public', 'cms.json');
const schemaPath = join(rootDir, 'schemas', 'cms.schema.json');
const imagesDir = join(rootDir, 'public', 'images');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function collectCategoryIds(categories) {
  const ids = [];

  for (const category of categories) {
    ids.push(category.id);
    if (Array.isArray(category.children) && category.children.length > 0) {
      ids.push(...collectCategoryIds(category.children));
    }
  }

  return ids;
}

function formatAjvErrors(errors) {
  return errors
    .map(error => {
      const path = error.instancePath || '/';
      const detail = error.message ?? 'invalid value';
      return `${path}: ${detail}`;
    })
    .join('\n');
}

function relative(path) {
  return path.replace(rootDir + '/', '');
}

function validateSchema(content) {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const validate = ajv.compile(schema);
  const valid = validate(content);

  if (!valid) {
    fail(`CMS schema validation failed:\n${formatAjvErrors(validate.errors)}`);
  }
}

function validateProducts(content) {
  const products = content.items;
  const badProducts = [];
  for (const product of products) {
    if (!/^[a-z-]*$/.test(product.id)) {
      badProducts.push(product.id);
    }
  }
  if (badProducts.length) {
    fail(`Bad product names ${badProducts.length} CMS id(s):\n${badProducts.join(', ')}`);
  }
}

function validateProductImages(id) {
  const productFolder = join(imagesDir, 'products');
  const missingProductImages = [];
  let lastImageIndex;
  for (let i = 20; i > 0; i--) {
    let path = join(productFolder, `${id}_${i}.png`);
    if (existsSync(path)) {
      lastImageIndex ??= i;
    } else if (lastImageIndex !== undefined) {
      missingProductImages.push(`  - ${relative(path)}`);
    }
  }
  if (lastImageIndex === undefined) {
    missingProductImages.push(`  - ${relative(productFolder)}/${id}_1.png`);
  }
  return missingProductImages;
}

function validateImages(content) {
  const categoryIds = collectCategoryIds(content.categories ?? []);
  const missingImages = categoryIds
    .map(id => join(imagesDir, 'categories', `${id}_thumbnail.png`))
    .filter(path => !existsSync(path))
    .map(path => `  - ${relative(path)}`);
  const productIds = (content.items ?? []).map(item => item.id);
  missingImages.push(...productIds.flatMap(id => validateProductImages(id)));

  if (missingImages.length > 0) {
    fail(`Missing images for ${missingImages.length} CMS id(s):\n${missingImages.join('\n')}`);
  }
}

if (!existsSync(cmsPath)) {
  fail('public/cms.json was not found');
}

let content;
try {
  content = JSON.parse(readFileSync(cmsPath, 'utf8'));
} catch (error) {
  fail(`public/cms.json is not valid JSON: ${error.message}`);
}

validateSchema(content);
validateProducts(content);
validateImages(content);

console.log('CMS validation passed.');
