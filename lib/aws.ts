import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const region = process.env.AWS_REGION ?? 'us-east-1'

export const sesClient = new SESClient({ region })
export const s3Client = new S3Client({ region })

interface StandingRow {
  position: number
  teamName: string
  played: number
  won: number
  drawn: number
  lost: number
  points: number
  isACSED: boolean
}

interface Article {
  title: string
  slug: string
  content: string
  imageUrl?: string | null
  standings?: StandingRow[]
}

interface Subscriber {
  email: string
  unsubscribeToken: string
}

function buildStandingsHtml(standings: StandingRow[]): string {
  const rows = standings.map((s) => {
    const rowBg = s.isACSED ? 'background-color:#F5EDD8;font-weight:bold;' : ''
    const teamCell = s.isACSED
      ? `<td style="padding:7px 10px;${rowBg}color:#1B2B4B;font-weight:bold;">${s.teamName}</td>`
      : `<td style="padding:7px 10px;">${s.teamName}</td>`
    return `<tr style="${rowBg}">
      <td style="padding:7px 10px;text-align:center;color:#666;">${s.position}</td>
      ${teamCell}
      <td style="padding:7px 10px;text-align:center;">${s.played}</td>
      <td style="padding:7px 10px;text-align:center;">${s.won}</td>
      <td style="padding:7px 10px;text-align:center;">${s.drawn}</td>
      <td style="padding:7px 10px;text-align:center;">${s.lost}</td>
      <td style="padding:7px 10px;text-align:center;font-weight:bold;color:#1B2B4B;">${s.points}</td>
    </tr>`
  }).join('')

  return `<div style="margin-top:32px;">
  <p style="color:#1B2B4B;font-size:14px;font-weight:bold;margin:0 0 10px 0;text-transform:uppercase;letter-spacing:0.5px;">Tabla de posiciones</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;color:#333;">
    <thead>
      <tr style="background-color:#1B2B4B;color:#FAF7F0;">
        <th style="padding:8px 10px;text-align:center;font-weight:600;">#</th>
        <th style="padding:8px 10px;text-align:left;font-weight:600;">Equipo</th>
        <th style="padding:8px 10px;text-align:center;font-weight:600;">PJ</th>
        <th style="padding:8px 10px;text-align:center;font-weight:600;">PG</th>
        <th style="padding:8px 10px;text-align:center;font-weight:600;">PE</th>
        <th style="padding:8px 10px;text-align:center;font-weight:600;">PP</th>
        <th style="padding:8px 10px;text-align:center;font-weight:600;">Pts</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</div>`
}

function buildEmailHtml(article: Article, subscriber: Subscriber, siteUrl: string): string {
  const articleUrl = `${siteUrl}/news/${article.slug}`
  const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${subscriber.unsubscribeToken}`

  // Mantener párrafos separados y limitar a 1000 caracteres
  const fullContent = article.content.trim()
  const excerptRaw = fullContent.slice(0, 1000)
  // Si cortamos en medio de un párrafo, terminarlo con puntos suspensivos
  const excerpt = excerptRaw.length < fullContent.length ? excerptRaw.trim() + '...' : excerptRaw

  // Convertir párrafos separados por \n en elementos HTML <p>
  const paragraphs = excerpt.split('\n').filter(p => p.trim()).map(p =>
    `<p style="color:#555555;font-size:15px;line-height:1.7;text-align:justify;margin:0 0 16px 0;">${p.trim()}</p>`
  ).join('')

  const imageBlock = article.imageUrl
    ? `<img src="${article.imageUrl}" alt="${article.title}" style="width:100%;max-width:600px;border-radius:8px;margin-bottom:24px;display:block;" />`
    : ''

  const standingsBlock = article.standings && article.standings.length > 0
    ? buildStandingsHtml(article.standings)
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${article.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF7F0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1B2B4B;padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="height:48px;">
                          <img src="${siteUrl}/ACSED-email.webp" alt="AC SED" style="height:48px;width:auto;display:block;" />
                        </td>
                        <td style="padding-left:10px;">
                          <span style="color:#FAF7F0;font-weight:bold;font-size:18px;">AC SED</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right">
                    <span style="color:#C8A96E;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Newsletter</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${imageBlock}
              <h1 style="color:#1B2B4B;font-size:24px;font-weight:800;margin:0 0 16px 0;line-height:1.3;">${article.title}</h1>
              ${paragraphs}
              <a href="${articleUrl}" style="display:inline-block;background-color:#1B2B4B;color:#FAF7F0;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:8px;margin-top:8px;">
                Leer nota completa →
              </a>
              ${standingsBlock}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#EDE8DC;padding:20px 32px;text-align:center;">
              <p style="color:#888;font-size:12px;margin:0 0 8px 0;">Liga B Chile · AC SED</p>
              <p style="margin:0;">
                <a href="${unsubscribeUrl}" style="color:#888;font-size:12px;text-decoration:underline;">
                  Desuscribirse del newsletter
                </a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export type { StandingRow }

export async function sendNewsletterEmail(
  article: Article,
  subscribers: Subscriber[],
  siteUrl: string
): Promise<number> {
  const from = process.env.AWS_SES_FROM_EMAIL ?? 'newsletter@acsed.cl'
  let sent = 0

  for (const subscriber of subscribers) {
    const html = buildEmailHtml(article, subscriber, siteUrl)
    const command = new SendEmailCommand({
      Source: `AC SED <${from}>`,
      Destination: { ToAddresses: [subscriber.email] },
      Message: {
        Subject: { Data: article.title, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    })
    await sesClient.send(command)
    sent++
  }

  return sent
}

export async function uploadImageToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET ?? 'acsed-news-images'
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  })
  await s3Client.send(command)
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}
