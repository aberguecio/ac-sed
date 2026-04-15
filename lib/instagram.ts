const GRAPH_API_VERSION = 'v21.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

function buildCaption(title: string, content: string): string {
  const maxLength = 2200
  const hashtags = '\n\n#ACSED #LigaB #FútbolChileno #FútbolAmateur'
  const maxBody = maxLength - title.length - hashtags.length - 4 // 4 = "\n\n" separators

  const body = content.trim()
  const excerpt = body.length > maxBody ? body.slice(0, maxBody).trim() + '...' : body

  return `${title}\n\n${excerpt}${hashtags}`
}

async function waitForContainer(containerId: string, accessToken: string): Promise<void> {
  const maxAttempts = 10
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
    )
    const data = await res.json()

    if (data.status_code === 'FINISHED') return
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
      throw new Error(`Container failed with status: ${data.status_code}`)
    }

    // Wait 6 seconds between polls
    await new Promise((r) => setTimeout(r, 6000))
  }
  throw new Error('Timeout waiting for Instagram media container to be ready')
}

export async function postToInstagram(
  title: string,
  content: string,
  imageUrl: string
): Promise<string> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  const userId = process.env.INSTAGRAM_USER_ID

  if (!accessToken || !userId) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_USER_ID deben estar configurados')
  }

  const caption = buildCaption(title, content)

  // Step 1: Create media container
  const containerRes = await fetch(`${GRAPH_API_BASE}/${userId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    }),
  })

  const containerData = await containerRes.json()

  if (!containerRes.ok || !containerData.id) {
    throw new Error(
      `Error creando contenedor de Instagram: ${JSON.stringify(containerData.error ?? containerData)}`
    )
  }

  const containerId: string = containerData.id

  // Step 2: Wait for container to be ready
  await waitForContainer(containerId, accessToken)

  // Step 3: Publish
  const publishRes = await fetch(`${GRAPH_API_BASE}/${userId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken,
    }),
  })

  const publishData = await publishRes.json()

  if (!publishRes.ok || !publishData.id) {
    throw new Error(
      `Error publicando en Instagram: ${JSON.stringify(publishData.error ?? publishData)}`
    )
  }

  return publishData.id as string
}
