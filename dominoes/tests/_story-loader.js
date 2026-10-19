// Lets plain Node load the Story engine for tests: adds the ".js" Vite leaves
// off, and stands in for React and Supabase (the rules code never calls them).
const STUBS = {
  react: 'data:text/javascript,const n=()=>{};export const useState=n,useEffect=n,useRef=n,useCallback=n,useMemo=n;export default {}',
}
export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true }
  if (/\/lib\/supabase$/.test(specifier)) return { url: 'data:text/javascript,export const db={}', shortCircuit: true }
  try { return await next(specifier, context) } catch (e) {
    if ((specifier.startsWith('.') || specifier.startsWith('/')) && !/\.[cm]?jsx?$/.test(specifier)) return next(specifier + '.js', context)
    throw e
  }
}
