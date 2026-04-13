function extractLogoUrl(fullUrl) {
  if (!fullUrl) return null;

  let match = fullUrl.match(/\/team\/(\d+)\/\d+x\d+_(.+\.(?:jpeg|jpg|png))$/i);
  if (match) return match[2];

  match = fullUrl.match(/\/team\/(\d+)\/([a-f0-9-]+\.(?:jpeg|jpg|png))$/i);
  if (match) return match[2];

  return null;
}

const testUrls = [
  'https://liga-b.nyc3.digitaloceanspaces.com/team/3020/c161d4f3-2ddc-4270-9097-dcea7949c1cb.png',
  'https://liga-b.nyc3.digitaloceanspaces.com/team/2937/50x50_89857103-6c6b-4ac9-b8f6-619831f5e6c0.jpeg',
  'https://liga-b.nyc3.digitaloceanspaces.com/team/3184/03a8cd2e-20b0-4cf0-9bc2-3a622ec5780f.png'
];

console.log('Testing logo URL extraction:\n');
testUrls.forEach(url => {
  console.log('Original:', url);
  console.log('Extracted:', extractLogoUrl(url));
  console.log('---');
});