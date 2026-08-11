interface AvatarProps {
  name: string
  imageUrl: string | null
  size?: 'sm' | 'md'
}

// Clerk-hosted profile photos, not our own R2 assets - no resize proxy
// needed, Clerk already serves these pre-sized. Falls back to an initial
// on a neutral circle when there's no photo on file.
export default function Avatar({ name, imageUrl, size = 'sm' }: AvatarProps) {
  const dimension = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-14 h-14 text-lg'
  if (imageUrl) {
    return <img src={imageUrl} alt="" className={`${dimension} rounded-full object-cover shrink-0`} />
  }
  return (
    <span className={`${dimension} rounded-full bg-tint/10 text-cream/50 font-semibold flex items-center justify-center shrink-0`}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
