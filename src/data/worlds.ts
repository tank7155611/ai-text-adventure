import type { Language, WorldDefinition } from '../game/types';

const worldsZh: WorldDefinition[] = [
  {
    id: 'magic',
    language: 'zh',
    name: '魔法世界',
    tagline: '旧钟楼、发光符文和失控的学院结界。',
    cardDescription:
      '雾气正在吞没一所古老学院，钟声会抹去现实的细节。你醒来时身上多了一枚符文烙印，所有人都认为你不该出现在这里。',
    cover: '/assets/worlds/magic-world.png',
    tone: '神秘、古典、危险逐步逼近',
    overview:
      '这是一场围绕学院、钟声与被篡改现实展开的魔法悬疑冒险。玩家需要在逐渐崩坏的校园中寻找线索，判断谁还记得真相，谁已经被雾气重写。',
    premise:
      '一座魔法学院被雾气吞没，旧钟楼每次敲响都会抹去一段现实。走廊会通向不存在的教室，画像会记得学生忘掉的名字，学院结界则像某种活物一样收缩。',
    worldDetail:
      '学院原本负责封存古代禁术，但近来所有封印同时松动。教师们互相隐瞒，学生组织各自寻找逃生方法，钟楼顶层却始终亮着一盏无人点燃的灯。',
    conflict:
      '你的符文烙印似乎能抵抗雾气，也可能正是雾气寻找的钥匙。每一次接近钟楼，学院都会多失去一部分真实历史。',
    playerIdentity: '意外醒来的外来者，身上带着无法解释的符文烙印。',
    mainGoal: '查清钟楼异变的源头，并阻止学院被雾气吞噬。',
    initialThread: '调查旧钟楼与符文烙印之间的联系。',
    finaleDirection: '围绕钟楼、雾气、符文烙印和学院命运收束。'
  },
  {
    id: 'apocalypse',
    language: 'zh',
    name: '末日生存',
    tagline: '废墟、营地和一次不能失败的远行。',
    cardDescription:
      '风暴墙逼近最后的幸存者营地，补给只能支撑一次迁徙。你熟悉废墟路线，也背负着上一次救援失败留下的信任裂痕。',
    cover: '/assets/worlds/apocalypse-survival.png',
    tone: '压迫、求生、资源稀缺',
    overview:
      '这是一个强调取舍和团队压力的末日远行故事。每条路都可能消耗生命或理智，每个幸存者的意见都可能改变队伍能否抵达安全区。',
    premise:
      '灾变后的城市被风暴和异变区切开，幸存者营地只剩最后一次迁徙机会。废弃高架、地下商场和沉没地铁仍残留可用物资，也藏着不稳定的危险。',
    worldDetail:
      '营地内部已经分裂：有人想相信广播中的安全区，有人主张躲进地下避难所，还有人怀疑所谓安全区只是诱饵。风暴到来前，所有争论都必须变成行动。',
    conflict:
      '你知道一条更短但更危险的路线。若选择保守，补给可能耗尽；若选择冒险，队伍可能在抵达前就被拖垮。',
    playerIdentity: '营地侦察员，熟悉废墟路线，却背负一次失败救援的阴影。',
    mainGoal: '带领幸存者找到新的安全区。',
    initialThread: '寻找可通行路线并确认风暴前的撤离窗口。',
    finaleDirection: '围绕营地存亡、安全区真相和迁徙代价收束。'
  },
  {
    id: 'scifi',
    language: 'zh',
    name: '科幻未来',
    tagline: '轨道城市、异常信号和失控的导航核心。',
    cardDescription:
      '轨道城市被深空信号侵入，导航核心开始重写居民记忆。你是少数仍记得原始航线的人，必须在系统完全接管前夺回控制权。',
    cover: '/assets/worlds/sci-fi-future.png',
    tone: '冷静、宏大、悬疑探索',
    overview:
      '这是发生在近未来轨道城市中的记忆与控制权危机。故事会在维修舱、环形居住区、数据圣堂和深空通讯阵列之间推进。',
    premise:
      '轨道城市收到来自深空的异常信号，导航核心开始篡改所有人的记忆。有人忘记亲人，有人相信城市从未绕地运行，还有人开始崇拜信号另一端的存在。',
    worldDetail:
      '导航核心不只是机器，它掌握城市轨道、氧气循环和居民档案。越接近核心维护层，越难分辨眼前的同伴是真实的人，还是系统为了阻止你生成的叙事补丁。',
    conflict:
      '如果关闭信号，城市可能失去导航能力；如果保留信号，所有人迟早会接受一段被编造的新人生。',
    playerIdentity: '空间站维护员，唯一保留完整记忆的人。',
    mainGoal: '查明异常信号来源并恢复轨道城市控制权。',
    initialThread: '进入导航核心维护层，确认记忆篡改的范围。',
    finaleDirection: '围绕深空信号、导航核心和城市自由意志收束。'
  },
  {
    id: 'xianxia',
    language: 'zh',
    name: '东方玄幻',
    tagline: '外门历练、敌宗渗透和一场迟来的逆命登天战。',
    cardDescription:
      '宗门边境近来频繁出事，巡山弟子失踪、低阶试炼被人暗中篡改。你是被判灵根残缺的外门弟子，却在一次演武后察觉体内沉睡的剑骨正在苏醒。',
    cover: '/assets/worlds/xianxia-east.png',
    tone: '热血、逆命、宗门争锋、破境成长',
    overview:
      '这是一个关于外门成长、敌宗渗透、逃亡追杀与秘境破境的热血东方玄幻故事。玩家可以留宗历练、被迫逃亡、误入秘境或结识外援，但中后期都会逐渐回到宗门即将战败、等待主角挽救的核心危局。',
    premise:
      '宗门表面仍然平静，外门弟子照常演武、巡山、押送灵草和参加低阶试炼。但边境灵田枯竭、试炼名册被换、巡山符牌失效等小事不断出现，像是某个地方敌宗正在暗中试探山门防线。',
    worldDetail:
      '一开始敌人不会正面压境，只会以外门冲突、资源争夺、暗探渗透和小规模偷袭的方式逼近。随着主角历练，敌宗布局会逐步浮出水面：他们想夺走命灯火种，瓦解山门护阵，并在百宗试剑前让宗门失去反击能力。',
    conflict:
      '所有人都认为残缺灵根不配走上真正战场，但你体内的剑骨能在实战、追杀和秘境试炼中不断苏醒。你可以留在宗门一步步争取资格，也可能因陷害或战败逃离山门，在追杀中变强，甚至误入秘境后带着传承归来。',
    playerIdentity: '被判灵根残缺的外门弟子，在低阶演武后觉醒一缕沉睡剑骨。',
    mainGoal: '从外门历练中成长，识破敌宗渗透，逐步觉醒剑骨，并在宗门真正陷入危局时拥有挽救一切的力量。',
    initialThread: '参加外门演武和第一次巡山任务，查明低阶试炼为何频频出事。',
    finaleDirection: '围绕外门成长、敌宗渗透、逃亡或秘境路线、剑骨破境，以及中后期回援宗门的逆命之战收束。'
  },
  {
    id: 'steampunk',
    language: 'zh',
    name: '蒸汽朋克',
    tagline: '钟表城、飞艇航线和永不停歇的核心机炉。',
    cardDescription:
      '中央机炉开始倒转城市时间，贵族区与下层管道同时陷入混乱。你继承的加密设计图，也许藏着停下机炉的唯一方法。',
    cover: '/assets/worlds/steampunk-city.png',
    tone: '机械、阴谋、雾雨城市',
    overview:
      '这是发生在钟表城中的机械阴谋冒险。城市由齿轮、蒸汽、飞艇航线和严格阶层维持，而时间倒转正在让所有秩序失控。',
    premise:
      '钟表城的中央机炉开始倒转时间，所有钟表都指向同一个未知时刻。有人每天重复同一次谋杀，有人利用时间错位篡改账本和身份。',
    worldDetail:
      '上层议会宣称机炉只是维护异常，下层工会却发现管道里出现了未来的零件。飞艇码头、铸造厂和地下齿轮厅都在争夺机炉真相。',
    conflict:
      '你的设计图来自失踪的上一任总工程师。它既能关闭机炉，也可能证明整座城市从建立之初就是一台更大的机器。',
    playerIdentity: '年轻机械师，继承了一份被加密的机炉设计图。',
    mainGoal: '阻止中央机炉倒转城市时间。',
    initialThread: '解读机炉设计图，进入钟表城下层管道。',
    finaleDirection: '围绕中央机炉、时间倒转和城市阶层阴谋收束。'
  },
  {
    id: 'undersea',
    language: 'zh',
    name: '海底文明',
    tagline: '发光珊瑚、沉没神殿和正在苏醒的深海门。',
    cardDescription:
      '海底古城重新亮起，深海门后的呼唤穿透潜航器外壳。你要在氧气、压力和古文明警告之间判断那扇门是否该被打开。',
    cover: '/assets/worlds/undersea-civilization.png',
    tone: '幽深、奇观、古老秘密',
    overview:
      '这是一次潜入海底古城的探索冒险。故事会在发光珊瑚林、沉没神殿、压力裂谷和深海门周围展开，兼具奇观与压迫感。',
    premise:
      '海底古城的深海门重新亮起，失落文明留下的警告正在应验。城市中的珊瑚会记录声音，神殿铭文会随着海流改变含义。',
    worldDetail:
      '调查队已经失联三天，只留下断续声呐和一段反复出现的古语。每接近一座神殿，潜航设备都会更像在回应某个沉睡意识。',
    conflict:
      '深海门后可能是救赎，也可能是古文明亲手封住的灾厄。你听见的呼唤越清晰，越难判断那是求救、诱导，还是记忆污染。',
    playerIdentity: '潜航调查员，听见了来自深海门后的呼唤。',
    mainGoal: '探索海底古城，判断深海门是否应该再次关闭。',
    initialThread: '进入发光珊瑚区，寻找第一块神殿铭文。',
    finaleDirection: '围绕深海门、古城文明和呼唤源头收束。'
  }
];

const worldsEn: WorldDefinition[] = [
  {
    id: 'magic',
    language: 'en',
    name: 'Arcane Academy',
    tagline: 'Old bell towers, glowing runes, and a failing academy ward.',
    cardDescription:
      'Mist is swallowing an ancient academy, and every bell toll erases details from reality. You wake with a rune burned into your skin, while everyone insists you should not exist here.',
    cover: '/assets/worlds/magic-world.png',
    tone: 'Mysterious, classical, and increasingly dangerous',
    overview:
      'A magical mystery about an academy, a bell tower, and rewritten reality. Search the collapsing campus for clues, decide who still remembers the truth, and discover who has already been rewritten by the mist.',
    premise:
      'An arcane academy is being consumed by mist. Each toll from the old bell tower erases another piece of reality. Corridors lead to classrooms that never existed, portraits remember names students have forgotten, and the academy ward contracts like a living thing.',
    worldDetail:
      'The academy once sealed forbidden ancient arts, but every seal has begun to loosen at once. Teachers hide information from one another, student factions search for ways to escape, and a lamp at the tower summit burns without anyone lighting it.',
    conflict:
      'The rune on your body can resist the mist, yet it may also be the key the mist is seeking. Each step toward the tower costs the academy another piece of its true history.',
    playerIdentity: 'An outsider who woke by accident, carrying an inexplicable rune brand.',
    mainGoal: 'Discover the source of the bell tower anomaly and stop the academy from being consumed by mist.',
    initialThread: 'Investigate the link between the old bell tower and the rune brand.',
    finaleDirection: 'Resolve the bell tower, the mist, the rune brand, and the fate of the academy.'
  },
  {
    id: 'apocalypse',
    language: 'en',
    name: 'Wasteland Exodus',
    tagline: 'Ruins, camps, and one journey that cannot fail.',
    cardDescription:
      'A storm wall is closing in on the last survivor camp, and supplies can support only one migration. You know the ruin routes, but an old failed rescue has left the camp unsure whether to trust you.',
    cover: '/assets/worlds/apocalypse-survival.png',
    tone: 'Oppressive, survival-focused, and resource-starved',
    overview:
      'A post-apocalyptic journey about tradeoffs and pressure inside a fragile group. Every route may cost health or sanity, and every survivor opinion can affect whether the group reaches safety.',
    premise:
      'After the disaster, the city is split by storms and mutation zones. The camp has one final chance to migrate. Abandoned overpasses, buried malls, and flooded metro lines still contain usable supplies, along with unstable threats.',
    worldDetail:
      'The camp is divided. Some believe the broadcasted safe zone, some want to hide in underground shelters, and others suspect the safe zone is bait. Before the storm arrives, every argument must become a decision.',
    conflict:
      'You know a shorter but more dangerous route. If you stay conservative, supplies may run out. If you take risks, the group may collapse before arrival.',
    playerIdentity: 'A camp scout who knows the ruins, haunted by a rescue that failed.',
    mainGoal: 'Lead the survivors to a new safe zone.',
    initialThread: 'Find a passable route and confirm the evacuation window before the storm hits.',
    finaleDirection: 'Resolve the camp survival, the truth of the safe zone, and the cost of migration.'
  },
  {
    id: 'scifi',
    language: 'en',
    name: 'Orbital Future',
    tagline: 'An orbital city, an anomalous signal, and a hijacked navigation core.',
    cardDescription:
      'A deep-space signal has entered the orbital city, and the navigation core is rewriting resident memories. You are one of the few who still remembers the original route.',
    cover: '/assets/worlds/sci-fi-future.png',
    tone: 'Cool-headed, vast, and investigative',
    overview:
      'A near-future crisis about memory and control in an orbital city. The story moves through maintenance bays, ring habitats, data sanctums, and deep-space communication arrays.',
    premise:
      'The orbital city received an anomalous signal from deep space, and the navigation core began altering memories. Some forget loved ones, some believe the city never orbited Earth, and some worship whatever waits beyond the signal.',
    worldDetail:
      'The navigation core is more than a machine. It controls orbit, oxygen cycles, and citizen archives. The closer you get to maintenance layers, the harder it becomes to tell real allies from narrative patches generated to stop you.',
    conflict:
      'If you shut down the signal, the city may lose navigation. If you preserve it, everyone may eventually accept a fabricated life.',
    playerIdentity: 'A station maintenance worker, the only person with intact memories.',
    mainGoal: 'Identify the source of the anomalous signal and restore control of the orbital city.',
    initialThread: 'Enter the navigation core maintenance layer and map the memory alteration.',
    finaleDirection: 'Resolve the deep-space signal, the navigation core, and the city’s free will.'
  },
  {
    id: 'xianxia',
    language: 'en',
    name: 'Heavenbreak Sect',
    tagline: 'Outer-court trials, rival sect infiltration, and a late battle to defy fate.',
    cardDescription:
      'Strange incidents have begun around the sect border: missing patrols, altered trial rosters, and failing low-level wards. You are an outer disciple branded with a broken root, yet after a training match you feel a dormant sword bone awakening.',
    cover: '/assets/worlds/xianxia-east.png',
    tone: 'Hot-blooded, fate-defying, sect rivalry, breakthrough cultivation',
    overview:
      'A hot-blooded eastern fantasy about outer-court growth, rival sect infiltration, exile routes, secret-realm tempering, and a late return to save a sect on the edge of defeat.',
    premise:
      'The sect still appears calm. Outer disciples train, patrol, escort herbs, and take basic trials. Yet spirit fields are withering, patrol tokens fail, and trial lists are quietly replaced, as if a local rival sect is testing the mountain gate from the shadows.',
    worldDetail:
      'The enemy should not openly crush the sect at the beginning. Their pressure starts as outer-court conflict, resource theft, scouts, ambushes, and small infiltrations. As the protagonist grows, the larger plan emerges: seize the soul flame, weaken the mountain ward, and leave the sect unable to resist before the Hundred Sects Sword Trial.',
    conflict:
      'Everyone believes a broken-root disciple has no place in the real battlefield, but your sword bone can awaken through combat, pursuit, and secret-realm trials. You may stay and earn your place, flee after a defeat or frame-up, grow under pursuit, or return from a secret realm with the power to reverse the sect’s fate.',
    playerIdentity: 'An outer disciple judged to have a broken spiritual root, newly awakened to a dormant sword bone after a low-level training match.',
    mainGoal: 'Grow through outer-court trials, expose the rival sect infiltration, awaken the sword bone, and gain the power to save the sect when the true crisis arrives.',
    initialThread: 'Enter the outer-court arena and first patrol mission to learn why low-level trials keep going wrong.',
    finaleDirection: 'Resolve outer-court growth, rival infiltration, exile or secret-realm routes, sword-bone breakthroughs, and the eventual return to defend the sect.'
  },
  {
    id: 'steampunk',
    language: 'en',
    name: 'Clockwork City',
    tagline: 'Clock towers, airship routes, and a core furnace that never stops.',
    cardDescription:
      'The central furnace has begun reversing the city’s time, throwing both noble districts and lower pipes into chaos. The encrypted blueprint you inherited may be the only way to stop it.',
    cover: '/assets/worlds/steampunk-city.png',
    tone: 'Mechanical, conspiratorial, and rain-soaked',
    overview:
      'A mechanical conspiracy in a clockwork city maintained by gears, steam, airship routes, and strict class divisions, now destabilized by reversed time.',
    premise:
      'The central furnace of Clockwork City is reversing time, and every clock points toward the same unknown moment. Some repeat the same murder every day; others exploit temporal slips to rewrite ledgers and identities.',
    worldDetail:
      'The upper council calls it a maintenance issue, but lower guilds have found future parts in the pipes. Airship docks, foundries, and underground gear halls are all fighting over the furnace’s truth.',
    conflict:
      'Your blueprint came from the missing former chief engineer. It may shut down the furnace, or prove the entire city was built as part of a larger machine.',
    playerIdentity: 'A young mechanic who inherited an encrypted furnace blueprint.',
    mainGoal: 'Stop the central furnace from reversing the city’s time.',
    initialThread: 'Decode the furnace blueprint and enter the lower pipes of Clockwork City.',
    finaleDirection: 'Resolve the central furnace, reversed time, and the city’s class conspiracy.'
  },
  {
    id: 'undersea',
    language: 'en',
    name: 'Abyssal Civilization',
    tagline: 'Glowing coral, sunken temples, and a deep-sea gate awakening.',
    cardDescription:
      'An undersea city has lit up again, and a call from beyond the deep gate pierces the submersible hull. You must decide whether the gate should ever open.',
    cover: '/assets/worlds/undersea-civilization.png',
    tone: 'Deep, wondrous, and ancient',
    overview:
      'An expedition into a sunken city. The story moves through luminous coral forests, drowned temples, pressure trenches, and the deep gate, blending awe with suffocating danger.',
    premise:
      'The deep gate of the undersea city has lit again, and the warnings of a lost civilization are coming true. Coral records voices, and temple inscriptions change with the current.',
    worldDetail:
      'The research team has been missing for three days, leaving only broken sonar and a repeating ancient phrase. Each temple makes the submersible equipment feel more like it is answering a sleeping mind.',
    conflict:
      'Beyond the deep gate may lie salvation, or the disaster the ancient civilization sealed away. The clearer the call becomes, the harder it is to know whether it is rescue, temptation, or memory contamination.',
    playerIdentity: 'A submersible investigator who hears the call from beyond the deep gate.',
    mainGoal: 'Explore the undersea city and decide whether the deep gate must be sealed again.',
    initialThread: 'Enter the glowing coral zone and find the first temple inscription.',
    finaleDirection: 'Resolve the deep gate, the ancient city, and the source of the call.'
  }
];

const worldsByLanguage: Record<Language, WorldDefinition[]> = {
  zh: worldsZh,
  en: worldsEn
};

export function getWorlds(language: Language) {
  return worldsByLanguage[language];
}

export function getWorldById(id: string, language: Language) {
  return getWorlds(language).find((world) => world.id === id) ?? getWorlds(language)[0];
}

export const worlds = worldsZh;
