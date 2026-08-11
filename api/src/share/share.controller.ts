import { Controller, Get, Logger, Param, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RecipesService } from '../recipes/recipes.service'
import { Public } from '../auth/public.decorator'
import { ShareImageService, ALLOWED_WIDTHS } from './share-image.service'

const APP_URL = 'https://recipes.tugy.dev'
const FALLBACK_IMAGE = 'https://assets.tugy.dev/a-quick-date-and-honey-cake.jpg'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Link-preview crawlers (WhatsApp, iMessage, Slack, Twitter/X) fetch a URL
// and read its meta tags without running JS, so they can never see the SPA's
// client-rendered per-recipe content. This route exists purely to hand them
// a static page with the right tags, then bounce real visitors into the app.
@Controller('share')
export class ShareController {
  private readonly logger = new Logger(ShareController.name)

  constructor(
    private readonly recipesService: RecipesService,
    private readonly shareImageService: ShareImageService,
  ) {}

  @Public()
  @Get('recipes/:id')
  async shareRecipe(@Param('id') id: string, @Query('rev') rev: string | undefined, @Res() res: Response) {
    const hashPath = rev
      ? `/recipes/${encodeURIComponent(id)}?rev=${encodeURIComponent(rev)}`
      : `/recipes/${encodeURIComponent(id)}`
    const appUrl = `${APP_URL}/#${hashPath}`
    // Land on the app's root first (a real navigation, not a hash-only
    // change) and let it push the recipe route on top once it mounts -
    // redirecting straight to the recipe with location.replace() collapses
    // this page and the recipe into a single history entry with nothing
    // useful beneath it, so the back button has nowhere to go. Landing on
    // Home first means Home is a real entry the user can back into.
    const redirectUrl = `${APP_URL}/?share=${encodeURIComponent(hashPath)}`

    // findById already only ever returns recipes that have a publishedRevision,
    // so a personal/never-published recipe (nothing to preview) just bounces
    // straight into the app instead of leaking a private draft's content here.
    const recipe = await this.recipesService.findById(id)
    if (!recipe) {
      res.redirect(302, `${APP_URL}/`)
      return
    }

    // A specific past revision was requested - only ever consider published
    // ones (includeDrafts: false), so an in-progress draft can't leak either.
    const content = rev
      ? (await this.recipesService.listRevisions(id, false)).find(r => r.id === rev)?.snapshot ?? recipe
      : recipe

    const title = escapeHtml(String(content.title ?? ''))
    const description = escapeHtml(String(content.description || content.descriptionEn || ''))
    const rawImage = String(content.image || FALLBACK_IMAGE)
    // Recipe photos are uploaded at full camera resolution - crawlers like
    // WhatsApp's silently drop oversized og:images, so route our own hosted
    // photos through the resize proxy. Anything else (the static fallback,
    // or an unexpected foreign URL) is served as-is.
    const image = this.shareImageService.isAllowedSource(rawImage)
      ? `${APP_URL}/share/image?src=${encodeURIComponent(rawImage)}`
      // encodeURI, not encodeURIComponent - it leaves an already-valid URL's
      // structure (:, /, ?) intact while escaping raw non-ASCII characters
      // (e.g. an unencoded "pão" in the path), which crawlers reject outright.
      : encodeURI(rawImage)

    res.type('html').send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta property="og:type" content="article">
<meta property="og:site_name" content="Tugy's Cookbook">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${appUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<meta http-equiv="refresh" content="0; url=${redirectUrl}">
<script>location.replace(${JSON.stringify(redirectUrl)})</script>
</head>
<body>Redirecting to <a href="${appUrl}">${title}</a>&hellip;</body>
</html>`)
  }

  // `w` is whitelisted rather than accepting any number - an unbounded set of
  // widths would mean an unbounded set of cache entries (and sharp resize
  // calls) for the same source image, one per pixel value a caller feels
  // like sending.
  @Public()
  @Get('image')
  async shareImage(
    @Query('src') src: string | undefined,
    @Query('w') w: string | undefined,
    @Res() res: Response,
  ) {
    if (!src || !this.shareImageService.isAllowedSource(src)) {
      res.redirect(302, FALLBACK_IMAGE)
      return
    }
    const width = ALLOWED_WIDTHS.find(allowed => allowed === Number(w)) ?? 1200
    try {
      const buffer = await this.shareImageService.getResized(src, width)
      res.set('Cache-Control', 'public, max-age=2592000, immutable')
      res.type('image/jpeg').send(buffer)
    } catch (err) {
      this.logger.warn(`Failed to resize share image for ${src}: ${err instanceof Error ? err.message : err}`)
      res.redirect(302, FALLBACK_IMAGE)
    }
  }
}
