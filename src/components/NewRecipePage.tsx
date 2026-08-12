import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../hooks/useLanguage'
import { t } from "../i18n";

function bookmarkletHref(origin: string) {
  // The app is a HashRouter - everything after "#" is what the router
  // actually sees, so the target must be a hash URL, not a plain path
  // (which would just load the app fresh at Home with the url= silently
  // ignored, same bug the share_target manifest action had).
  const script = `(function(){location.href=${JSON.stringify(`${origin}/#/recipes/import?url=`)}+encodeURIComponent(location.href);})();`
  return `javascript:${script}`
}

export default function NewRecipePage() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const tx = t[lang]

  return (
    <div className="min-h-dvh bg-bg pt-20 px-4">
      <div className="max-w-md mx-auto space-y-4 text-center">
        <h1 className="font-serif text-2xl font-bold text-cream mb-6">
          {tx.howWouldYouLikeToAdd}
        </h1>
        <button type="button" onClick={() => navigate('/recipes/generate')} className="btn-primary w-full">
          {tx.researchARecipeWithAI}
        </button>
        <button type="button" onClick={() => navigate('/recipes/import')} className="btn-ghost w-full">
          {tx.importWithAI}
        </button>
        <button type="button" onClick={() => navigate('/recipes/new/blank')} className="btn-ghost w-full">
          {tx.startFromScratch}
        </button>

        <div className="card p-4 space-y-2 text-start">
          <p className="text-xs font-semibold text-cream/50">
            {tx.quickImport}
          </p>
          <p className="text-sm text-cream/50">
            {tx.dragThisButtonToYourBrowser}
          </p>
          <a
            href={bookmarkletHref(window.location.origin)}
            className="btn-ghost inline-block text-sm"
            draggable
          >
            {tx.importToCookbook}
          </a>
        </div>
      </div>
    </div>
  )
}
