// Lets plain Node load the game's rules code for tests: adds the ".js" Vite
// leaves off, and stands in for React and Supabase (the rules never call them;
// tests that need Supabase set db.auth / db.rpc on the stand-in themselves).
const REACT = 'data:text/javascript,const n=()=>{};export const useState=n,useEffect=n,useRef=n,useCallback=n,useMemo=n;export default {}'
const SUPABASE = 'data:text/javascript,export const db={}'
export async function resolve(specifier, context, next) {
  if (specifier === 'react') return { url: REACT, shortCircuit: true }
  let found
  try { found = await next(specifier, context) } catch (e) {
    if (!(specifier.startsWith('.') || specifier.startsWith('/')) || /\.[cm]?jsx?$/.test(specifier)) throw e
    found = await next(specifier + '.js', context)
  }
  // every import of src/lib/supabase gets the same stand-in
  if (/\/src\/lib\/supabase\.js$/.test(found.url)) return { url: SUPABASE, shortCircuit: true }
  return found
}
