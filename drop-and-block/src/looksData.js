export const MARKS=['','◆','●','▲','■','★','⬡','✦','✳','⬢'];
export const AVATARS={sentinel:'🛡️',wolf:'🐺',robot:'🤖',ninja:'🥷',dragon:'🐉',skull:'💀',
 astronaut:'🧑‍🚀',tiger:'🐯',gladiator:'⚔️',oni:'👹',phoenix:'🔥',king:'👑',cosmonaut:'🪐'};
export const BOARD_IDS=new Set(['deep-navy','neon-circuit','sandstone','emerald-vault','obsidian-gold','cosmic-violet','ruby-arena']);
export const CHIP_IDS=new Set(['round','hex','square','star','diamond','shield','bolt','crown']);
export const safeBoard=id=>BOARD_IDS.has(id)?id:'deep-navy';
export const safeChip=id=>CHIP_IDS.has(id)?id:'round';
export const safeAvatar=id=>Object.hasOwn(AVATARS,id)?id:'sentinel';
