import { Controller, Get, Param, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RecipesService } from '../recipes/recipes.service'
import { Public } from '../auth/public.decorator'

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
  constructor(private readonly recipesService: RecipesService) {}

  @Public()
  @Get('recipes/:id')
  async shareRecipe(@Param('id') id: string, @Query('rev') rev: string | undefined, @Res() res: Response) {
    const appUrl = rev
      ? `${APP_URL}/#/recipes/${encodeURIComponent(id)}?rev=${encodeURIComponent(rev)}`
      : `${APP_URL}/#/recipes/${encodeURIComponent(id)}`

    // findById already only ever returns recipes that have a publishedRevision,
    // so a personal/never-published recipe (nothing to preview) just bounces
    // straight into the app instead of leaking a private draft's content here.
    const recipe = await this.recipesService.findById(id)
    if (!recipe) {
      res.redirect(302, appUrl)
      return
    }

    // A specific past revision was requested - only ever consider published
    // ones (includeDrafts: false), so an in-progress draft can't leak either.
    const content = rev
      ? (await this.recipesService.listRevisions(id, false)).find(r => r.id === rev)?.snapshot ?? recipe
      : recipe

    const title = escapeHtml(String(content.title ?? ''))
    const description = escapeHtml(String(content.description || content.descriptionEn || ''))
    // encodeURI, not encodeURIComponent - it leaves an already-valid URL's
    // structure (:, /, ?) intact while escaping raw non-ASCII characters
    // (e.g. an unencoded "pão" in the path), which crawlers reject outright.
    const image = encodeURI(String(content.image || FALLBACK_IMAGE))

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
<meta http-equiv="refresh" content="0; url=${appUrl}">
<script>location.replace(${JSON.stringify(appUrl)})</script>
</head>
<body>Redirecting to <a href="${appUrl}">${title}</a>&hellip;</body>
</html>`)
  }
}
