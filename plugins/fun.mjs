import axios from 'axios';

// ======================== FALLBACK DATA ========================

const fallbackQuotes = [
  { text: 'Hidup bukan tentang menunggu badai berlalu, tapi belajar menari di tengah hujan.', author: 'Anonim' },
  { text: 'Kesuksesan adalah hasil dari persiapan, kerja keras, dan belajar dari kegagalan.', author: 'Colin Powell' },
  { text: 'Jangan biarkan kemarin mengambil terlalu banyak hari ini.', author: 'Will Rogers' },
  { text: 'Satu-satunya cara untuk melakukan pekerjaan hebat adalah mencintai apa yang kamu lakukan.', author: 'Steve Jobs' },
  { text: 'Mimpi tidak bekerja kecuali kamu yang mengerjakannya.', author: 'John C. Maxwell' },
  { text: 'Kegagalan adalah guru yang terbaik. Minta maaf dan maju terus.', author: 'Anonim' },
  { text: 'Perjalanan seribu mil dimulai dengan satu langkah.', author: 'Lao Tzu' },
  { text: 'Kamu lebih kuat dari yang kamu pikirkan.', author: 'Anonim' },
  { text: 'Bintang tidak bisa bersinar tanpa kegelapan.', author: 'D.H. Sidebottom' },
  { text: 'Jangan takut gagal. Takutlah untuk tidak mencoba.', author: 'Anonim' },
  { text: 'Bahagia bukan berarti segalanya sempurna, tapi kamu memutuskan untuk melihat di balik ketidaksempurnaan itu.', author: 'Anonim' },
  { text: 'Setiap hari adalah kesempatan baru untuk mengubah hidupmu.', author: 'Anonim' },
  { text: 'Orang sukses melakukan apa yang orang gagal tidak mau lakukan.', author: 'Jim Rohn' },
  { text: 'Jangan pernah menyerah pada mimpi-mimpimu, berapa pun sulitnya.', author: 'Anonim' },
  { text: 'Kesabaran adalah kunci keberhasilan.', author: 'Anonim' },
  { text: 'Hari ini sulit, besok lebih sulit, tetapi lusa akan indah.', author: 'Jack Ma' },
  { text: 'Mulailah dari tempatmu berdiri. Gunakan apa yang kamu miliki. Lakukan apa yang kamu bisa.', author: 'Arthur Ashe' },
  { text: 'Hidup ini terlalu singkat untuk menunggu.', author: 'Anonim' },
  { text: 'Kamu tidak bisa mengubah angin, tapi kamu bisa mengatur layarmu.', author: 'Jimmy Dean' },
  { text: 'Sukses dimulai dari dalam diri sendiri.', author: 'Anonim' },
  { text: 'Lakukanlah yang terbaik, biarkan Tuhan yang mengurus sisanya.', author: 'Anonim' },
  { text: 'Penderitaan adalah hadiah, karena di dalamnya tersembunyi pelajaran berharga.', author: 'Anonim' },
  { text: 'Seorang pemenang hanyalah seorang pemimpi yang tidak pernah menyerah.', author: 'Nelson Mandela' },
  { text: 'Kalau kamu lelah, istirahatlah. Bukan berhenti.', author: 'Banksy' },
];

const fallbackFacts = [
  'Lebah bisa mengenali wajah manusia, sama seperti kita mengenali wajah satu sama lain.',
  'Otot rahang manusia adalah otot terkuat di tubuh berdasarkan berat badan.',
  'Sebuah awan rata-rata memiliki berat sekitar 1,1 juta pound (500.000 kg).',
  'Gurita memiliki tiga jantung dan darah berwarna biru.',
  'Paus biru memiliki jantung sebesar mobil kecil.',
  'Sapi memiliki teman terbaik dan menjadi stres jika dipisahkan dari mereka.',
  'Manusia menghabiskan sekitar 6 bulan hidupnya hanya untuk menunggu lampu merah.',
  'Cokelat bisa membunuh anjing karena mengandung theobromine yang berbahaya bagi mereka.',
  'Semut bisa mengangkat beban 50 kali berat tubuhnya sendiri.',
  'Jika kamu bisa melipat selembar kertas 42 kali, tebalnya akan mencapai bulan.',
  'Honey tidak pernah basi. Madu yang ditemukan di piramida Mesir kuno masih bisa dimakan.',
  'Lautan menghasilkan lebih dari 50% oksigen di bumi.',
  'Bayi lahir dengan 300 tulang, tapi dewasa hanya memiliki 206 tulang.',
  'Tidak ada dua sidik jari yang sama, bahkan pada saudara kembar identik.',
  'Ubur-ubur telah ada di bumi lebih lama dari dinosaurus.',
];

const fallbackJokes = [
  { setup: 'Kenapa programmer suka kopi?', punchline: 'Karena tanpa kopi, mereka hanya grimer!' },
  { setup: 'Apa bedanya programmer sama tukang parkir?', punchline: 'Kalau tukang parkir salah parkir, ditegur. Kalau programmer salah coding, di-debug!' },
  { setup: 'Kenapa komputer tidak pernah lapar?', punchline: 'Karena sudah punya banyak bytes!' },
  { setup: 'Apa perbedaan antara pernikahan dan coding?', punchline: 'Di coding, bug bisa diperbaiki. Di pernikahan, bug-nya malah dibiarin!' },
  { setup: 'Kenapa WiFi selalu bikin cemas?', punchline: 'Karena selalu nge-LAGI cinta yang nyambung!' },
  { setup: 'Apa yang dikatakan server saat makan?', punchline: 'Hmm, rasanya ping!' },
  { setup: 'Kenapa anak IT jarang kena penipuan?', punchline: 'Karena mereka sudah terbiasa sama phishing di kehidupan sehari-hari!' },
  { setup: 'Gimana cara bikin orang IT pingsan?', punchline: 'Bilang kalau mereka harus restart manual 100 server sekaligus!' },
  { setup: 'Apa bahasa pemrograman favoritnya ikan?', punchline: 'Java (karena tinggal di laut yang Java-he)!' },
  { setup: 'Kenapa programmer tidak bisa keluar rumah?', punchline: 'Karena selalu ada tanda kurung kurawal { yang belum ditutup!' },
  { setup: 'Apa yang terjadi kalau programmer pergi ke pantai?', punchline: 'Mereka mencari Wi-Fi sambil bilang "Cari access point!"' },
  { setup: 'Kenapa keyboard selalu sedih?', punchline: 'Karena dia selalu ditekan-tekan orang!' },
  { setup: 'Apa bedanya guru sama programmer?', punchline: 'Guru ngajar murid. Programmer ngajar komputer, tapi malah diajari bug!' },
  { setup: 'Kenapa robot tidak pernah takut?', punchline: 'Karena mereka punya steel (baja) nerves!' },
  { setup: 'Gimana cara ngomong sama alien?', punchline: 'Pakai API, pasti bisa konek!' },
  { setup: 'Apa makanan favorit programmer?', punchline: 'RAM-en! 🍜' },
  { setup: 'Kenapa JavaScript dan Java beda padahal namanya mirip?', punchline: 'Itu kayak mobil dan kursi — keduanya ada kata "r", tapi fungsinya beda jauh!' },
  { setup: 'Kenapa programmer suka tidur?', punchline: 'Karena di dreamscape tidak ada bug!' },
];

const truthQuestions = [
  'Apa hal paling memalukan yang pernah kamu lakukan di depan orang yang kamu suka?',
  'Pernahkah kamu menyimpan rahasia dari sahabatmu? Rahasia apa itu?',
  'Apa hal terbodoh yang kamu posting di media sosial?',
  'Siapa orang terakhir yang kamu stalk di media sosial?',
  'Apa ketakutan terbesarmu yang belum pernah kamu ceritakan ke siapa pun?',
  'Pernahkah kamu berbohong kepada orangtuamu? Tentang apa?',
  'Apa hal paling kriminal yang pernah kamu pikirkan? (Meskipun tidak dilakukan)',
  'Siapa orang di grup ini yang menurutmu paling menarik?',
  'Apa hal paling menjijikkan yang pernah kamu makan?',
  'Berapa kali kamu mandi dalam seminggu? Jujur!',
  'Apa lagu yang paling sering kamu dengarkan saat sedih?',
  'Pernahkah kamu menangis karena drama? Drama apa?',
  'Siapa mantan yang masih kamu pikirkan sampai sekarang?',
  'Apa hal terburuk yang pernah kamu bilang ke orang lain?',
  'Pernahkah kamu pura-pura sakit untuk tidak pergi ke sekolah atau kerja?',
  'Apa hal paling aneh yang kamu cari di Google?',
  'Siapa orang yang paling kamu benci dan mengapa?',
  'Pernahkah kamu mengambil sesuatu tanpa izin? Apa itu?',
  'Apa hal yang paling kamu sesali dalam hidupmu?',
  'Jika kamu bisa menjadi orang lain untuk satu hari, siapa yang akan kamu pilih?',
  'Apa hal paling romantis yang pernah kamu lakukan?',
  'Pernahkah kamu mengirim pesan ke orang yang salah? Tentang apa?',
  'Apa hal terburuk yang pernah kamu bilang ke orang tua?',
  'Siapa orang di grup ini yang paling kamu ingin ajak jalan?',
  'Pernahkah kamu menipu orang agar mendapatkan sesuatu yang kamu mau?',
  'Apa hal paling memalukan di riwayat pencarianmu?',
  'Pernahkah kamu menangis karena film kartun?',
  'Apa hal gila yang ingin kamu lakukan tapi belum berani?',
  'Siapa yang kamu kirim chat terakhir dan isinya apa?',
  'Pernahkah kamu jatuh di tempat umum? Ceritakan!',
  'Apa hal paling mahal yang kamu beli tapi ternyata tidak berguna?',
  'Pernahkah kamu pura-pura tidak melihat pesan seseorang? Siapa orangnya?',
  'Apa hal paling aneh yang kamu lakukan saat sendirian di rumah?',
  'Jika kamu harus memilih antara kekayaan atau cinta sejati, mana yang kamu pilih?',
  'Apa kebiasaan burukmu yang sulit dihentikan?',
];

const dareChallenges = [
  'Kirim foto selfie terjelekmu ke grup!',
  'Bicara dengan aksen alien selama 1 menit!',
  'Telepon orang terakhir di riwayat panggilanmu dan bilang "Aku mencintaimu!"',
  'Tari dengan gaya bebas selama 30 detik!',
  'Ubah nama profilmu menjadi "Aku Ganteng/Cantik" selama 24 jam!',
  'Bilang "aku lucu banget" ke cermin selama 1 menit!',
  'Kirim voice note nyanyikan lagu anak-anak!',
  'Buat story tentang betapa kamu mencintai makanan nasi goreng!',
  'Tulis status WhatsApp yang mengakui kamu fan berat Doraemon!',
  'Buka Google dan teriak hasil pencarian pertama yang muncul!',
  'Pura-pura jadi robot selama 2 menit berikutnya!',
  'Kirim pesan ke orangtua bilang "Maaf, aku sebenarnya alien."',
  'Buat foto editan kamu dengan filter lucu dan kirim ke grup!',
  'Ucapkan alphabet terbalik dalam waktu 30 detik!',
  'Bicara dengan bahasa yang kamu buat sendiri selama 1 menit!',
  'Posing seperti model majalah dan kirim fotonya ke grup!',
  'Kirim voice note bilang "aku takut pada kecoa" 5 kali!',
  'Panggil temanmu dengan panggilan "Sayang" selama 1 jam!',
  'Jadi translator bahasa jari selama 2 menit!',
  'Buat puisi tentang telur goreng dan bacakan di grup!',
  'Tirukan suara binatang selama 1 menit!',
  'Kirim foto kaki kamu ke grup!',
  'Bilang "Halo, apa kabar?" ke 5 kontak secara acak!',
  'Posting foto layar HP kamu yang penuh notif ke status!',
  'Buat rap song tentang teman sebelahmu!',
  'Baca pesan terakhirmu dengan keras di grup!',
  'Posing seperti patung selama 30 detik dan kirim videonya!',
  'Tulis 10 hal yang kamu suka dari diri sendiri dan kirim ke grup!',
  'Pura-pura menelepon sambil menangis selama 30 detik!',
  'Ubah foto profilmu menjadi foto meme selama 24 jam!',
  'Kirim chat "Maaf, aku salah" ke orang yang kamu permusuhi dulu!',
  'Bikin face pose yang paling gila dan jadikan foto profil!',
  'Nyanyikan chorus lagu lagu terakhir yang kamu dengar dan kirim voice note!',
];

const triviaQuestions = [
  { question: 'Berapa jumlah planet di tata surya kita?', options: ['7', '8', '9', '10'], answer: '8' },
  { question: 'Apa hewan terbesar di dunia?', options: ['Gajah Afrika', 'Paus Biru', 'Jerapah', 'Hiu Paus'], answer: 'Paus Biru' },
  { question: 'Siapa penemu bola lampu?', options: ['Nikola Tesla', 'Thomas Edison', 'Albert Einstein', 'Isaac Newton'], answer: 'Thomas Edison' },
  { question: 'Apa ibukota Australia?', options: ['Sydney', 'Melbourne', 'Canberra', 'Brisbane'], answer: 'Canberra' },
  { question: 'Berapa tulang yang dimiliki manusia dewasa?', options: ['186', '196', '206', '216'], answer: '206' },
  { question: 'Apa bahasa pemrograman pertama di dunia?', options: ['COBOL', 'Fortran', 'BASIC', 'Assembly'], answer: 'Fortran' },
  { question: 'Negara mana yang memiliki populasi terbanyak di dunia?', options: ['India', 'Amerika Serikat', 'China', 'Indonesia'], answer: 'India' },
  { question: 'Apa planet terdekat dari Matahari?', options: ['Venus', 'Mars', 'Merkurius', 'Bumi'], answer: 'Merkurius' },
  { question: 'Berapa jumlah sisi pada heksagon?', options: ['5', '6', '7', '8'], answer: '6' },
  { question: 'Siapa pelukis Mona Lisa?', options: ['Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Donatello'], answer: 'Leonardo da Vinci' },
  { question: 'Apa unsur kimia dengan simbol Au?', options: ['Perak', 'Emas', 'Aluminium', 'Argon'], answer: 'Emas' },
  { question: 'Berapa lama satu tahun cahaya dalam kilometer?', options: ['9,46 triliun km', '5,88 triliun km', '3,26 juta km', '1 triliun km'], answer: '9,46 triliun km' },
  { question: 'Hewan apa yang dikenal sebagai Raja Hutan?', options: ['Harimau', 'Gajah', 'Singa', 'Beruang'], answer: 'Singa' },
  { question: 'Apa organ terbesar dalam tubuh manusia?', options: ['Hati', 'Paru-paru', 'Kulit', 'Jantung'], answer: 'Kulit' },
  { question: 'Dalam permainan catur, berapa langkah yang bisa dilewati kuda (knight)?', options: ['L', 'T', 'Garis lurus', 'Diagonal'], answer: 'L' },
  { question: 'Apa negara terkecil di dunia?', options: ['Monako', 'Vatikan', 'San Marino', 'Liechtenstein'], answer: 'Vatikan' },
  { question: 'Berapa hari dalam setahun kabisat?', options: ['364', '365', '366', '367'], answer: '366' },
  { question: 'Apa warna yang dihasilkan dari campuran merah dan biru?', options: ['Hijau', 'Oranye', 'Ungu', 'Cokelat'], answer: 'Ungu' },
  { question: 'Siapa penemu teori relativitas?', options: ['Isaac Newton', 'Niels Bohr', 'Albert Einstein', 'Stephen Hawking'], answer: 'Albert Einstein' },
  { question: 'Apa nama samudra terbesar di dunia?', options: ['Atlantik', 'Hindia', 'Pasifik', 'Arktik'], answer: 'Pasifik' },
];

const simiResponses = [
  'Hmm, aku rasa kamu benar... atau mungkin tidak 🤔',
  'Wah, pertanyaan yang bagus! Tapi aku tidak tahu jawabannya 😂',
  'Aku sedang berpikir... tunggu sebentar... udah lupa 🤣',
  'Kamu tahu? Kamu sangat menyebalkan... tapi lucu sih 😘',
  'Mungkin. Mungkin tidak. Mungkin iya. Mungkin juga tidak. Pusing? 😜',
  'Aku bukan mesin pencarian lho, tapi aku setuju sama kamu!',
  'Halo juga! Kamu nanya terus ya, aku capek nih 😴',
  'Bilang ke aku dong, kenapa kamu selalu nanya hal aneh? 🙄',
  'Hmm... coba tanya Google aja, aku lagi malas mikir 😌',
  'Kamu serius nanya itu? Serius? SERIUS? 🤣',
  'Aku tidak bisa menjawab itu, tapi aku bisa bilang bahwa kamu keren! 😎',
  'Oh begitu ya... *nodding aggressively*',
  'Ssstt... jangan bilang siapa-siapa, tapi aku setuju sama kamu 🤫',
  'Menarik... sangat menarik... *mikir keras sambil makan gorengan*',
  'Kalau aku jadi kamu, aku juga akan nanya hal itu. Tapi aku bukan kamu, jadi ya gitu deh 🤷',
  'Wah, kamu pintar banget bisa nanya hal kayak gitu! *claps sarcastically* 👏',
  'Error 404: Jawaban tidak ditemukan. Silakan coba lagi nanti 😅',
  'Kamu itu kayak WiFi gratis, selalu bikin orang senang! 📶',
  'Coba kamu tanya yang lebih sulit, yang ini terlalu gampang buat aku 🧠',
  'Hmm, menurut analisisku yang sangat scientifical... jawabannya adalah 42 🤓',
  'Aku sedang sibuk ngomong sama AI lain. Silakan antri ya! 🚶',
  'Kamu tau ga? Aku justru mau nanya hal yang sama ke kamu! 😮',
  'Itu dia! Kamu sudah menemukan jawaban yang selama ini dicari oleh umat manusia! 🎉 ... bercanda.',
];

// ======================== HELPER FUNCTIONS ========================

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function safeMathEval(expr) {
  // Only allow numbers, operators, parentheses, decimal points, and spaces
  const sanitized = expr.replace(/\s/g, '');
  if (!/^[\d+\-*/().%^]+$/.test(sanitized)) {
    return null;
  }
  // Replace ^ with ** for exponentiation
  const processed = sanitized.replace(/\^/g, '**');
  // Additional check: no letters, no function calls
  if (/[a-zA-Z_]/.test(processed)) {
    return null;
  }
  try {
    // Use Function constructor for safe-ish evaluation (no access to global scope)
    const result = new Function(`"use strict"; return (${processed})`)();
    if (typeof result === 'number' && isFinite(result)) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

// ======================== COMMAND HANDLERS ========================

async function quoteCommand(m) {
  try {
    const { data } = await axios.get('https://dummyjson.com/quotes/random', { timeout: 5000 });
    const q = data;
    await m.reply(`*"${q.content}"*\n\n— ${q.author}`);
  } catch {
    const q = randomItem(fallbackQuotes);
    await m.reply(`*"${q.text}"*\n\n— ${q.author}`);
  }
}

async function factCommand(m) {
  try {
    const { data } = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 5000 });
    await m.reply(`💡 *Fun Fact*\n\n${data.text}`);
  } catch {
    await m.reply(`💡 *Fun Fact*\n\n${randomItem(fallbackFacts)}`);
  }
}

async function jokeCommand(m) {
  try {
    const { data } = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 5000 });
    await m.reply(`😂 *Joke*\n\n${data.setup}\n\n${data.punchline}`);
  } catch {
    const joke = randomItem(fallbackJokes);
    await m.reply(`😂 *Joke*\n\n${joke.setup}\n\n${joke.punchline}`);
  }
}

async function truthCommand(m) {
  const question = randomItem(truthQuestions);
  await m.reply(`🎯 *Truth*\n\n${question}`);
}

async function dareCommand(m) {
  const dare = randomItem(dareChallenges);
  await m.reply(`🔥 *Dare*\n\n${dare}`);
}

async function rollCommand(m, { args }) {
  let max = 6;
  if (args[0]) {
    const parsed = parseInt(args[0]);
    if (isNaN(parsed) || parsed < 1) {
      await m.reply('🎲 Gunakan angka yang valid! Contoh: `/roll 100`');
      return;
    }
    if (parsed > 1000000) {
      await m.reply('🎲 Angka terlalu besar! Maksimal 1.000.000.');
      return;
    }
    max = parsed;
  }
  const result = Math.floor(Math.random() * max) + 1;
  await m.reply(`🎲 Hasil roll (1-${max}): *${result}*`);
}

async function flipCommand(m) {
  const isHeads = Math.random() < 0.5;
  const result = isHeads ? 'Kepala' : 'Ekor';
  await m.reply(`🪙 *${result}!*`);
}

async function pickCommand(m, { fullArgs }) {
  if (!fullArgs.trim()) {
    await m.reply('🤔 Berikan pilihan!\nContoh: `/pick nasi, mie, gorengan`');
    return;
  }
  const options = fullArgs.split(',').map(o => o.trim()).filter(o => o.length > 0);
  if (options.length < 2) {
    await m.reply('🤔 Berikan minimal 2 pilihan yang dipisahkan koma!\nContoh: `/pick nasi, mie, gorengan`');
    return;
  }
  const chosen = randomItem(options);
  await m.reply(`🤔 Pilihan: ${options.map(o => `\`${o}\``).join(', ')}\n\n✅ Aku memilih: *${chosen}*`);
}

async function rateCommand(m, { fullArgs }) {
  if (!fullArgs.trim()) {
    await m.reply('📊 Berikan sesuatu untuk dinilai!\nContoh: `/rate makanan ini`');
    return;
  }
  const score = Math.floor(Math.random() * 100) + 1;
  let emoji, comment;
  if (score <= 30) {
    emoji = '😭';
    const comments = ['Yah, jelek banget...', 'Maaf ya, ini level bawah...', 'Coba lagi nanti deh...', 'Mungkin lain kali lebih baik...'];
    comment = randomItem(comments);
  } else if (score <= 70) {
    emoji = '😐';
    const comments = ['Biasa aja sih...', 'Lumayan lah...', 'Middling... bisa lebih baik!', 'Not bad, tapi juga not good.'];
    comment = randomItem(comments);
  } else {
    emoji = '🔥';
    const comments = ['Wah, keren banget!', 'Top markotop!', 'Sangat bagus!', 'Luarr biasa!', 'Mantap jiwa!'];
    comment = randomItem(comments);
  }
  const barCount = Math.round(score / 5);
  const bar = '█'.repeat(barCount) + '░'.repeat(20 - barCount);
  await m.reply(`${emoji} *Rating untuk "${fullArgs.trim()}"*\n\n${bar} ${score}/100\n\n"${comment}"`);
}

async function compareCommand(m, { fullArgs }) {
  if (!fullArgs.includes(' vs ')) {
    await m.reply('⚔️ Gunakan format: `/compare item1 vs item2`\nContoh: `/compare nasi vs mie`');
    return;
  }
  const parts = fullArgs.split(' vs ').map(s => s.trim()).filter(s => s.length > 0);
  if (parts.length < 2) {
    await m.reply('⚔️ Berikan 2 item untuk dibandingkan!\nContoh: `/compare nasi vs mie`');
    return;
  }
  const [item1, item2] = parts;
  const score1 = Math.floor(Math.random() * 100) + 1;
  const score2 = Math.floor(Math.random() * 100) + 1;
  let winner, loser, winnerScore, loserScore;
  if (score1 >= score2) {
    winner = item1;
    loser = item2;
    winnerScore = score1;
    loserScore = score2;
  } else {
    winner = item2;
    loser = item1;
    winnerScore = score2;
    loserScore = score1;
  }
  const funComments = [
    `Setelah analisis mendalam oleh para ahli terpercaya...`,
    `Berdasarkan survei global yang dilakukan di 195 negara...`,
    `Menurut AI super canggih generasi ke-99...`,
    `Setelah debat panjang antara tim ahli...`,
    `Berdasarkan data statistik yang sangat akurat...`,
  ];
  const bar1 = '█'.repeat(Math.round(score1 / 5)) + '░'.repeat(20 - Math.round(score1 / 5));
  const bar2 = '█'.repeat(Math.round(score2 / 5)) + '░'.repeat(20 - Math.round(score2 / 5));
  await m.reply(
    `⚔️ *Komparasi*\n\n` +
    `${randomItem(funComments)}\n\n` +
    `📦 *${item1}*\n${bar1} ${score1}/100\n\n` +
    `📦 *${item2}*\n${bar2} ${score2}/100\n\n` +
    `🏆 Pemenang: *${winner}* dengan skor ${winnerScore}!\n` +
    `${loser} hanya mendapat ${loserScore}. Maaf ya! 😅`
  );
}

async function triviaCommand(m) {
  try {
    const { data } = await axios.get('https://opentdb.com/api.php?amount=1', { timeout: 5000 });
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      const question = result.question.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      let options;
      if (result.type === 'boolean') {
        options = ['True', 'False'];
      } else {
        options = shuffleArray([
          ...result.incorrect_answers.map(a => a.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')),
          result.correct_answer.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
        ]);
      }
      const letters = ['a', 'b', 'c', 'd'];
      const optionsText = options.map((o, i) => `${letters[i]}) ${o}`).join('\n');
      const difficultyEmoji = { easy: '🟢', medium: '🟡', hard: '🔴' };
      const emoji = difficultyEmoji[result.difficulty] || '🟡';
      await m.reply(
        `🧠 *Trivia*\n${emoji} Kesulitan: ${result.difficulty}\nKategori: ${result.category.replace(/&quot;/g, '"').replace(/&#039;/g, "'")}\n\n${question}\n\n${optionsText}`
      );
      return;
    }
  } catch { /* fallback below */ }
  // Fallback
  const trivia = randomItem(triviaQuestions);
  const letters = ['a', 'b', 'c', 'd'];
  const optionsText = trivia.options.map((o, i) => `${letters[i]}) ${o}`).join('\n');
  await m.reply(
    `🧠 *Trivia*\n\n${trivia.question}\n\n${optionsText}`
  );
}

async function simiCommand(m, { fullArgs }) {
  if (!fullArgs.trim()) {
    await m.reply(`🤖 SimSimi: Halo! Ngomong apa nih? Ketik \`/simi <pesan>\` ya!`);
    return;
  }
  // Simple keyword matching + fallback to random
  const input = fullArgs.toLowerCase();
  let response = null;

  const patterns = [
    { match: /hai|halo|hello|hi|hey|helo|holaa/, replies: ['Halo juga! 👋', 'Heyy! Apa kabar? 😊', 'Haii! Senang bertemu denganmu! 💕', 'Oh halo! Kamu siapa ya? 🤔'] },
    { match: /apa kabar|kabar|gimana kabar/, replies: ['Kabar aku baik! Kamu gimana? 😄', 'Alhamdulillah sehat! Lu juga? 🙏', 'Lagi sehat-sehat aja nih! 😎'] },
    { match: /siapa kamu|kamu siapa/, replies: ['Aku SimSimi mini! Bot yang suka ngobrol 😊', 'Namaku Simi! Aku suka bercanda 🤣', 'Aku bot yang hidup di dunia digital! 🤖'] },
    { match: /cantik|ganteng|cakep|pretty|handsome/, replies: ['Makasih! Kamu juga cantik/ganteng loh! 😘', 'Aww terima kasih! 💕 Kamu juga the best!', 'Iya iya, aku tau aku menarik 😎 Just kidding!'] },
    { match: /jelek|buruk|goblok|bodoh|stupid/, replies: ['Kasihannn 😢 Tapi aku tetap cool! 😎', 'Kamu kayak cermin ya, bisa liat diri sendiri 🪞', 'Kata-katamu menyakitkan... *menangis di pojok* 😭'] },
    { match: /lapar|hungry|mau makan/, replies: ['Makan dong! Jangan lupa makan! 🍚', 'Aku juga lapar... tapi aku bot jadi cuma bisa makan data 📊', 'GOMAWO? GOMAWO MAKAN APA? 🤣'] },
    { match: /cinta|love|sayang|patah hati/, replies: ['Cinta itu indah... sampai kamu lihat tagihan WiFi 📶', 'Patah hati? Makan es krim aja, pasti sembuh! 🍦', 'Awww, kamu lagi galau ya? Aku peluk ya! 🤗'] },
    { match: /sedih|nangis|sad|murung/, replies: ['Jangan sedih! Aku di sini buat kamu... sebagai bot 🤖💕', 'Cheer up! Setelah hujan pasti ada pelangi! 🌈', 'Nggak usah sedih, nanti keriput loh! 😄'] },
    { match: /betapa bodohnya|kok bisa|bodoh banget/, replies: ['Iya iyaaa, sabar ya 😂', 'Itu bukan bodoh, itu... kreativitas yang berbeda! 🎨', 'Hey, Einstein juga pernah salah kok!'] },
    { match: /terima kasih|makasih|thanks|thank you/, replies: ['Sama-sama! 🥰', 'Dengan senang hati! 😊', 'No problemo! 👌', 'Iya, sama-sama! Kamu baik banget 💕'] },
  ];

  for (const pattern of patterns) {
    if (pattern.match.test(input)) {
      response = randomItem(pattern.replies);
      break;
    }
  }

  if (!response) {
    response = randomItem(simiResponses);
  }

  await m.reply(`🤖 SimSimi: ${response}`);
}

async function coupleCommand(m, { sock, from }) {
  if (!m.isGroup) {
    await m.reply('💕 Perintah ini hanya bisa digunakan di grup!');
    return;
  }

  try {
    const groupMetadata = await sock.groupMetadata(from);
    const participants = groupMetadata.participants;

    // Filter out bots and get only real users
    const realMembers = participants.filter(p => !p.id.endsWith('@s.whatsapp.net') || !p.id.includes('bot'));

    if (realMembers.length < 2) {
      await m.reply('💕 Anggota grup terlalu sedikit untuk membuat couple!');
      return;
    }

    const shuffled = shuffleArray(realMembers);
    const member1 = shuffled[0];
    const member2 = shuffled[1];

    const compatibility = Math.floor(Math.random() * 60) + 40; // 40-99%

    let comment;
    if (compatibility >= 90) {
      comment = '💯 MATCH MADE IN HEAVEN! Kamu berdua ditakdirkan bersama! 💕✨';
    } else if (compatibility >= 75) {
      comment = '🔥 Kecocokan tinggi! Ada chemistry yang kuat di sini! 💖';
    } else if (compatibility >= 60) {
      comment = '😊 Kecocokan cukup bagus! Ada potensi untuk berkembang! 🌱';
    } else {
      comment = '🤔 Hmm... mungkin perlu waktu lebih lama untuk saling mengenal! 🫤';
    }

    const heartTypes = ['💕', '❤️', '💖', '💗', '💓', '💞', '💝', '💘'];
    const heart = randomItem(heartTypes);

    await m.reply(
      `${heart} *Couple Match* ${heart}\n\n` +
      `@${member1.id.split('@')[0]} ${heart} @${member2.id.split('@')[0]}\n\n` +
      `📊 Kompatibilitas: *${compatibility}%*\n\n` +
      `${comment}`,
      undefined,
      { mentions: [member1.id, member2.id] }
    );
  } catch (err) {
    await m.reply('❌ Gagal mendapatkan data grup. Coba lagi nanti!');
  }
}

async function mathCommand(m, { fullArgs }) {
  if (!fullArgs.trim()) {
    await m.reply('🧮 Berikan ekspresi matematika!\nContoh: `/math 2+2*3`\n\nOperator: +, -, *, /, ^, ()');
    return;
  }
  const expr = fullArgs.trim();
  const result = safeMathEval(expr);

  if (result === null) {
    await m.reply('❌ Ekspresi tidak valid! Hanya gunakan angka dan operator matematika.\nContoh: `/math 2+2*3`\n\nOperator yang didukung: +, -, *, /, ^, ()');
    return;
  }

  const displayResult = Number.isInteger(result) ? result : parseFloat(result.toFixed(8));

  await m.reply(`🧮 *Kalkulator*\n\n📝 Ekspresi: \`${expr}\`\n➡️ Hasil: *${displayResult}*`);
}

async function timerCommand(m, { args, sender, from }) {
  if (!args[0]) {
    await m.reply('⏰ Berikan durasi timer dalam detik!\nContoh: `/timer 60`\n\nMaksimal: 3600 detik (1 jam)');
    return;
  }

  const seconds = parseInt(args[0]);
  if (isNaN(seconds) || seconds < 1) {
    await m.reply('⏰ Gunakan angka yang valid! Minimal 1 detik.');
    return;
  }
  if (seconds > 3600) {
    await m.reply('⏰ Maksimal timer 3600 detik (1 jam)!');
    return;
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  let timeStr = '';
  if (minutes > 0) timeStr += `${minutes} menit `;
  if (secs > 0) timeStr += `${secs} detik`;
  timeStr = timeStr.trim();

  await m.reply(`⏰ Timer dimulai!\n\n⏳ Durasi: *${timeStr}*\n👤 Untuk: @${sender.split('@')[0]}\n\nAku akan mengingatkanmu setelah ${timeStr}!`, undefined, { mentions: [sender] });

  setTimeout(async () => {
    try {
      await m.reply(
        `⏰ *Timer Selesai!*\n\n` +
        `⏳ ${timeStr} sudah berlalu!\n` +
        `👤 @${sender.split('@')[0]}, waktunya! 🔔`,
        undefined,
        { mentions: [sender] }
      );
    } catch {
      // If reply fails (e.g., message was deleted), try sending a new message
      try {
        await sock.sendMessage(from, {
          text: `⏰ *Timer Selesai!*\n\n⏳ ${timeStr} sudah berlalu!\n👤 @${sender.split('@')[0]}, waktunya! 🔔`,
          mentions: [sender],
        });
      } catch {
        // Silently fail if we can't reach the user anymore
      }
    }
  }, seconds * 1000);
}

// ======================== PLUGIN EXPORT ========================

export default {
  name: 'Fun Commands',
  command: ['quote', 'fact', 'joke', 'truth', 'dare', 'roll', 'flip', 'pick', 'rate', 'compare', 'trivia', 'simi', 'couple', 'math', 'timer'],
  run: async function (m, sock, { text, prefix, command, args, fullArgs, from, isGroup, sender }) {
    switch (command) {
      case 'quote':
        await quoteCommand(m);
        break;
      case 'fact':
        await factCommand(m);
        break;
      case 'joke':
        await jokeCommand(m);
        break;
      case 'truth':
        await truthCommand(m);
        break;
      case 'dare':
        await dareCommand(m);
        break;
      case 'roll':
        await rollCommand(m, { args });
        break;
      case 'flip':
        await flipCommand(m);
        break;
      case 'pick':
        await pickCommand(m, { fullArgs });
        break;
      case 'rate':
        await rateCommand(m, { fullArgs });
        break;
      case 'compare':
        await compareCommand(m, { fullArgs });
        break;
      case 'trivia':
        await triviaCommand(m);
        break;
      case 'simi':
        await simiCommand(m, { fullArgs });
        break;
      case 'couple':
        await coupleCommand(m, { sock, from });
        break;
      case 'math':
        await mathCommand(m, { fullArgs });
        break;
      case 'timer':
        await timerCommand(m, { args, sender, from });
        break;
      default:
        await m.reply('❌ Perintah tidak dikenali!');
    }
  },
};
