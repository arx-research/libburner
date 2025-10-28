export interface ITheme {
  id: string
  sku: string
  color: string
  background: string
  backgroundSize: string
  backgroundRepeat: string
  backgroundBlendMode: string
  nickname: string
  public: boolean
  apps: IThemeApp[]
}

export interface IThemeApp {
  iconUrl: string
  name: string
  url: string
}

export const themeBaseColors = {
  acid: '#c1e003',
  jade: '#00735d',
  sapphire: '#005baa',
  cherry: '#ed145b',
  mandarin: '#f37043',
  galaxy: '#6f2c91',
  darkGrey: '#241f21',
  bitcoin: "#f7931a",
}

export const defaultTheme: ITheme = {
  id: '1',
  sku: 'brnr128a24a-acid',
  color: '#c1e003',
  background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/bottom-pattern.svg',
  nickname: 'acid',
  backgroundSize: '16px',
  backgroundRepeat: 'repeat-x',
  backgroundBlendMode: 'soft-light',
  public: true,
  apps: [],
}

export const FullThemes: { [key: string]: ITheme } = {
  '1': {
    id: '1',
    sku: 'brnr128a24a-acid',
    color: themeBaseColors.acid,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/bottom-pattern.svg',
    nickname: 'acid',
    backgroundSize: '16px',
    backgroundRepeat: 'repeat-x',
    backgroundBlendMode: 'soft-light',
    public: true,
    apps: [],
  },
  '2': {
    id: '2',
    sku: 'brnr128a24j-jade',
    color: themeBaseColors.jade,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/bottom-pattern.svg',
    nickname: 'jade',
    backgroundSize: '16px',
    backgroundRepeat: 'repeat-x',
    backgroundBlendMode: 'soft-light',
    public: true,
    apps: [],
  },
  '3': {
    id: '3',
    sku: 'brnr128a24s-sapphire',
    color: themeBaseColors.sapphire,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/bottom-pattern.svg',
    nickname: 'sapphire',
    backgroundSize: '16px',
    backgroundRepeat: 'repeat-x',
    backgroundBlendMode: 'soft-light',
    public: true,
    apps: [],
  },
  '4': {
    id: '4',
    sku: 'brnr128a24c-cherry',
    color: themeBaseColors.cherry,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/bottom-pattern.svg',
    nickname: 'cherry',
    backgroundSize: '16px',
    backgroundRepeat: 'repeat-x',
    backgroundBlendMode: 'soft-light',
    public: true,
    apps: [],
  },
  '5': {
    id: '5',
    sku: 'brnr128a24m-mandarin',
    color: themeBaseColors.mandarin,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/bottom-pattern.svg',
    nickname: 'mandarin',
    backgroundSize: '16px',
    backgroundRepeat: 'repeat-x',
    backgroundBlendMode: 'soft-light',
    public: true,
    apps: [],
  },
  '6': {
    id: '6',
    sku: 'brnr128a24g-galaxy',
    color: themeBaseColors.galaxy,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/bottom-pattern.svg',
    nickname: 'galaxy',
    backgroundSize: '16px',
    backgroundRepeat: 'repeat-x',
    backgroundBlendMode: 'soft-light',
    public: true,
    apps: [],
  },
  '7': {
    id: '7',
    sku: 'custom1',
    color: themeBaseColors.darkGrey,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/custom1.jpg',
    backgroundSize: '350px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'custom1',
    public: true,
    apps: [],
  },
  '8': {
    id: '8',
    sku: 'custom2',
    color: themeBaseColors.darkGrey,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/custom2.jpg',
    backgroundSize: '350px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'custom2',
    public: true,
    apps: [],
  },
  '9': {
    id: '9',
    sku: 'custom3',
    color: themeBaseColors.darkGrey,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/custom3.jpg',
    backgroundSize: '350px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'custom3',
    public: true,
    apps: [],
  },
  a: {
    id: 'a',
    sku: 'custom4',
    color: themeBaseColors.darkGrey,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/custom4.jpg',
    backgroundSize: '350px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'custom4',
    public: true,
    apps: [],
  },
  b: {
    id: 'b',
    sku: 'custom5',
    color: themeBaseColors.darkGrey,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/custom5.jpg',
    backgroundSize: '350px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'custom5',
    public: true,
    apps: [],
  },
  c: {
    id: 'c',
    sku: 'custom6',
    color: themeBaseColors.darkGrey,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/custom6.jpg',
    backgroundSize: '350px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'custom6',
    public: true,
    apps: [],
  },
  d: {
    id: 'd',
    sku: 'brnr128a25g-ethglobal',
    color: themeBaseColors.mandarin,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/ethglobal-bg.jpg',
    backgroundSize: '85px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'ethglobal',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/EthGlobalIcon-bQtfE2tLVrmn5c3OWB0dtgE6thrbzd.svg',
        name: 'EthGlobal',
        url: 'https://ethglobal.com',
      },
    ],
  },
  e: {
    id: 'e',
    sku: 'brnr128a25s-mandarin',
    color: themeBaseColors.mandarin,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/shefi-bg.jpg',
    backgroundSize: '110px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'shefi-mandarin',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/ShefiIcon-ZAlqBA05fOGxGpMy8woC3I2YxNkT4M.svg',
        name: 'SheFi',
        url: 'https://www.shefi.org/',
      },
    ],
  },
  f: {
    id: 'f',
    sku: 'brnr128a25s-galaxy',
    color: themeBaseColors.galaxy,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/shefi-bg.jpg',
    backgroundSize: '110px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'shefi-galaxy',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/ShefiIcon-ZAlqBA05fOGxGpMy8woC3I2YxNkT4M.svg',
        name: 'SheFi',
        url: 'https://www.shefi.org/',
      },
    ],
  },
  g: {
    id: 'g',
    sku: 'brnr128a25d-green',
    color: themeBaseColors.jade,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/dsc-bg.jpg',
    backgroundSize: '82px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'dsc-green',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/dsc-icon-SynlqeRxop5QyvzOopv7nrHAZP0xqB.svg',
        name: 'Digital Spenders Club',
        url: 'https://spenders.club/',
      },
    ],
  },
  h: {
    id: 'h',
    sku: 'brnr128a25d-orange',
    color: themeBaseColors.mandarin,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/dsc-bg.jpg',
    backgroundSize: '82px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'dsc-orange',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/dsc-icon-SynlqeRxop5QyvzOopv7nrHAZP0xqB.svg',
        name: 'Digital Spenders Club',
        url: 'https://spenders.club/',
      },
    ],
  },
  i: {
    id: 'i',
    sku: 'brnr128a25d-purple',
    color: themeBaseColors.galaxy,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/dsc-bg.jpg',
    backgroundSize: '82px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'dsc-purple',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/dsc-icon-SynlqeRxop5QyvzOopv7nrHAZP0xqB.svg',
        name: 'Digital Spenders Club',
        url: 'https://spenders.club/',
      },
    ],
  },
  j: {
    id: 'j',
    sku: 'brnr128a25e-ens',
    color: themeBaseColors.sapphire,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/ens-bg.jpg',
    backgroundSize: '80px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'ens',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/ens-icon-XNnvYTBHA5mzvRVZARjbMONxN1s2mW.svg',
        name: 'ENS',
        url: 'https://ens.domains/',
      },
    ],
  },
  k: {
    id: 'k',
    sku: 'brnr128a25f-acid',
    color: themeBaseColors.acid,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/eth-foundation.jpg',
    backgroundSize: '80px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'eth-foundation-acid',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/EthFoundationIcon-4KAir0bNyQP5M1132qpqxJUKlgXbFS.svg',
        name: 'BLOBS',
        url: 'https://blobs.newforum.io/',
      },
    ],
  },
  l: {
    id: 'l',
    sku: 'brnr128a25f-mandarin',
    color: themeBaseColors.mandarin,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/eth-foundation.jpg',
    backgroundSize: '80px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'eth-foundation-mandarin',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/EthFoundationIcon-4KAir0bNyQP5M1132qpqxJUKlgXbFS.svg',
        name: 'BLOBS',
        url: 'https://blobs.newforum.io/'
      },
    ],
  },
  m: {
    id: 'm',
    sku: 'brnr128a25f-cherry',
    color: themeBaseColors.cherry,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/eth-foundation.jpg',
    backgroundSize: '80px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'eth-foundation-cherry',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/EthFoundationIcon-4KAir0bNyQP5M1132qpqxJUKlgXbFS.svg',
        name: 'BLOBS',
        url: 'https://blobs.newforum.io/',
      },
    ],
  },
  n: {
    id: 'n',
    sku: 'brnr128a25f-jade',
    color: themeBaseColors.jade,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/eth-foundation.jpg',
    backgroundSize: '80px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'eth-foundation-jade',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/EthFoundationIcon-4KAir0bNyQP5M1132qpqxJUKlgXbFS.svg',
        name: 'BLOBS',
        url: 'https://blobs.newforum.io/',
      },
    ],
  },
  o: {
    id: 'o',
    sku: 'brnr128a25f-sapphire',
    color: themeBaseColors.sapphire,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/eth-foundation.jpg',
    backgroundSize: '80px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'eth-foundation-sapphire',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/EthFoundationIcon-4KAir0bNyQP5M1132qpqxJUKlgXbFS.svg',
        name: 'BLOBS',
        url: 'https://blobs.newforum.io/',
      },
    ],
  },
  p: {
    id: 'p',
    sku: 'brnr128a25f-galaxy',
    color: themeBaseColors.galaxy,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/eth-foundation.jpg',
    backgroundSize: '80px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'eth-foundation-galaxy',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/EthFoundationIcon-4KAir0bNyQP5M1132qpqxJUKlgXbFS.svg',
        name: 'BLOBS',
        url: 'https://blobs.newforum.io/',
      },
    ],
  },
  q: {
    id: "q",
    sku: "brnrbtca25b-orange",
    color: themeBaseColors.bitcoin,
    background:
      "https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/bottom-pattern.svg",
    backgroundSize: "16px",
    backgroundRepeat: "repeat-x",
    backgroundBlendMode: "soft-light",
    nickname: "bitcoin",
    public: false,
    apps: [],
  },
  r: {
    id: 'r',
    sku: 'brnr128a25f-sapphirel1',
    color: themeBaseColors.sapphire,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/eth-foundation.jpg',
    backgroundSize: '80px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'eth-foundation-sapphire-l1',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/l1randd-aXavewVhe466JhU3AvsUEwqheIfIWn.svg',
        name: 'L1 R&D',
        url: 'https://notes.ethereum.org/@timbeiko/berlin-agenda',
      },
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/calendar-DkOR58UELOzA9b9dZVY9EXEkUusUfN.svg',
        name: 'Workshop Calendar',
        url: 'https://docs.google.com/spreadsheets/d/1UqtuuBrClZCW-HD0Rd_5JUFjI8OhLXfWNtO8Wyu19YI/edit?gid=513673475#gid=513673475',
      },
    ],
  },
  s: {
    id: 's',
    sku: 'brnr128a25f.cherryl1',
    color: themeBaseColors.cherry,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/eth-foundation.jpg',
    backgroundSize: '80px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'eth-foundation-cherry-l1',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/l1randd-aXavewVhe466JhU3AvsUEwqheIfIWn.svg',
        name: 'L1 R&D',
        url: 'https://notes.ethereum.org/@timbeiko/berlin-agenda',
      },
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/calendar-DkOR58UELOzA9b9dZVY9EXEkUusUfN.svg',
        name: 'Workshop Calendar',
        url: 'https://docs.google.com/spreadsheets/d/1UqtuuBrClZCW-HD0Rd_5JUFjI8OhLXfWNtO8Wyu19YI/edit?gid=513673475#gid=513673475',
      },
    ],
  },
  t: {
    id: 't',
    sku: 'brnr128a25d.dgen1',
    color: themeBaseColors.darkGrey,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/brnr128a25d-dgen1.jpg',
    backgroundSize: '82px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'dgen1',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/dgen1-Icon.svg',
        name: 'DGEN1',
        url: 'https://recovery.freedomfactory.io',
      },
    ],
  },
  u: {
    id: 'u',
    sku: 'brnr128a25c-nouns',
    color: themeBaseColors.darkGrey,
    background: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/images/noun-bg.jpg',
    backgroundSize: '82px',
    backgroundRepeat: 'repeat',
    backgroundBlendMode: 'normal',
    nickname: 'noun',
    public: false,
    apps: [
      {
        iconUrl: 'https://yxn3olywcbmko66l.public.blob.vercel-storage.com/themes/app-icons/noun-app.svg',
        name: 'Nouns',
        url: 'https://nouns.wtf/',
      },
    ],
  },
}

export const findTheme = (query?: string): ITheme => {
  if (!query) return FullThemes['1']

  const foundTheme = Object.values(FullThemes).find(
    (theme) =>
      theme.id === query || theme.sku === query || theme.color === query || theme.nickname === query
  )

  return foundTheme || FullThemes['1']
}
