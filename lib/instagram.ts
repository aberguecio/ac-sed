const IG_USER_ID = process.env.INSTAGRAM_USER_ID ?? '26782910464676207'
const IG_API_BASE = 'https://graph.instagram.com/v21.0'

function getToken(): string {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
  if (!token) throw new Error('INSTAGRAM_ACCESS_TOKEN not configured')
  return token
}

async function igFetch(path: string, options?: RequestInit) {
  const url = `${IG_API_BASE}${path}`
  const res = await fetch(url, options)
  const data = await res.json()
  if (data.error) {
    throw new Error(`Instagram API error: ${data.error.message} (code ${data.error.code})`)
  }
  return data
}

// --- Account ---

export async function getAccountInfo(): Promise<{
  id: string
  username: string
  mediaCount: number
  accountType: string
}> {
  const data = await igFetch(
    `/me?fields=id,username,media_count,account_type&access_token=${getToken()}`
  )
  return {
    id: data.id,
    username: data.username,
    mediaCount: data.media_count,
    accountType: data.account_type,
  }
}

// --- Single image post ---

export async function createSinglePostContainer(
  imageUrl: string,
  caption: string
): Promise<string> {
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: getToken(),
  })
  const data = await igFetch(`/${IG_USER_ID}/media`, {
    method: 'POST',
    body: params,
  })
  return data.id as string
}

// --- Carousel items ---

export async function createCarouselItemContainer(imageUrl: string): Promise<string> {
  const params = new URLSearchParams({
    image_url: imageUrl,
    is_carousel_item: 'true',
    access_token: getToken(),
  })
  const data = await igFetch(`/${IG_USER_ID}/media`, {
    method: 'POST',
    body: params,
  })
  return data.id as string
}

export async function createCarouselContainer(
  childIds: string[],
  caption: string
): Promise<string> {
  const params = new URLSearchParams({
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
    access_token: getToken(),
  })
  const data = await igFetch(`/${IG_USER_ID}/media`, {
    method: 'POST',
    body: params,
  })
  return data.id as string
}

// --- Publish ---

export async function publishMedia(creationId: string): Promise<string> {
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: getToken(),
  })
  const data = await igFetch(`/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: params,
  })
  return data.id as string
}

// --- Convenience wrappers ---

export async function publishSinglePost(
  imageUrl: string,
  caption: string
): Promise<{ mediaId: string }> {
  const containerId = await createSinglePostContainer(imageUrl, caption)
  const mediaId = await publishMedia(containerId)
  return { mediaId }
}

export async function publishCarouselPost(
  imageUrls: string[],
  caption: string
): Promise<{ mediaId: string }> {
  // Step 1: Create child containers for each image
  const childIds: string[] = []
  for (const url of imageUrls) {
    const id = await createCarouselItemContainer(url)
    childIds.push(id)
  }

  // Step 2: Create carousel container
  const carouselId = await createCarouselContainer(childIds, caption)

  // Step 3: Publish
  const mediaId = await publishMedia(carouselId)
  return { mediaId }
}
