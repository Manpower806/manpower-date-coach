import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:manpower-bruderschaft@proton.me',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const MOTIVATIONS = {
  de: [
    "💪 Kein Mann wurde jemals schwächer durch Disziplin.",
    "👑 Du bist nicht hier um zu überleben. Du bist hier um zu dominieren.",
    "🔥 Andere schlafen. Du wächst. Das ist der Unterschied.",
    "⚔️ Schmerz ist temporär. Stärke ist permanent.",
    "🎯 Heute ist ein weiterer Tag um besser zu werden als gestern.",
    "👁️ Die Welt respektiert Männer die sich selbst respektieren.",
    "💎 Routine ist die Waffe des Siegers.",
    "🦁 Ein Löwe fragt nicht um Erlaubnis.",
  ],
  en: [
    "💪 No man ever became weaker through discipline.",
    "👑 You're not here to survive. You're here to dominate.",
    "🔥 Others sleep. You grow. That's the difference.",
    "⚔️ Pain is temporary. Strength is permanent.",
    "🎯 Today is another day to be better than yesterday.",
    "👁️ The world respects men who respect themselves.",
    "💎 Routine is the weapon of the winner.",
    "🦁 A lion doesn't ask for permission.",
  ],
  tr: [
    "💪 Hiçbir adam disiplinle zayıflamadı.",
    "👑 Burada hayatta kalmak için değil, hükmetmek için varsın.",
    "🔥 Diğerleri uyuyor. Sen büyüyorsun. İşte fark bu.",
    "⚔️ Acı geçicidir. Güç kalıcıdır.",
    "🎯 Bugün dünden daha iyi olmak için bir gün daha.",
    "👁️ Dünya kendine saygı duyan erkeklere saygı duyar.",
    "💎 Rutin, kazananın silahıdır.",
    "🦁 Aslan izin istemez.",
  ],
  ar: [
    "💪 لم يضعف رجل قط بسبب الانضباط.",
    "👑 أنت هنا لتسود، لا لتبقى فحسب.",
    "🔥 الآخرون نائمون. أنت تنمو. هذا هو الفرق.",
    "⚔️ الألم مؤقت. القوة دائمة.",
    "🎯 اليوم يوم آخر لتكون أفضل من الأمس.",
    "👁️ العالم يحترم الرجال الذين يحترمون أنفسهم.",
    "💎 الروتين هو سلاح الفائز.",
    "🦁 الأسد لا يطلب الإذن.",
  ],
  es: [
    "💪 Ningún hombre se volvió más débil por la disciplina.",
    "👑 No estás aquí para sobrevivir. Estás aquí para dominar.",
    "🔥 Otros duermen. Tú creces. Esa es la diferencia.",
    "⚔️ El dolor es temporal. La fuerza es permanente.",
    "🎯 Hoy es otro día para ser mejor que ayer.",
    "👁️ El mundo respeta a los hombres que se respetan a sí mismos.",
    "💎 La rutina es el arma del ganador.",
    "🦁 Un león no pide permiso.",
  ],
  it: [
    "💪 Nessun uomo è mai diventato più debole grazie alla disciplina.",
    "👑 Non sei qui per sopravvivere. Sei qui per dominare.",
    "🔥 Gli altri dormono. Tu cresci. Questa è la differenza.",
    "⚔️ Il dolore è temporaneo. La forza è permanente.",
    "🎯 Oggi è un altro giorno per essere migliore di ieri.",
    "👁️ Il mondo rispetta gli uomini che rispettano se stessi.",
    "💎 La routine è l'arma del vincitore.",
    "🦁 Un leone non chiede il permesso.",
  ],
  fr: [
    "💪 Aucun homme n'est jamais devenu plus faible grâce à la discipline.",
    "👑 Tu n'es pas ici pour survivre. Tu es ici pour dominer.",
    "🔥 Les autres dorment. Tu grandis. C'est la différence.",
    "⚔️ La douleur est temporaire. La force est permanente.",
    "🎯 Aujourd'hui est un autre jour pour être meilleur qu'hier.",
    "👁️ Le monde respecte les hommes qui se respectent.",
    "💎 La routine est l'arme du gagnant.",
    "🦁 Un lion ne demande pas la permission.",
  ],
  ru: [
    "💪 Ни один мужчина не стал слабее от дисциплины.",
    "👑 Ты здесь не чтобы выживать. Ты здесь чтобы доминировать.",
    "🔥 Другие спят. Ты растёшь. В этом разница.",
    "⚔️ Боль временна. Сила постоянна.",
    "🎯 Сегодня ещё один день стать лучше, чем вчера.",
    "👁️ Мир уважает мужчин, которые уважают себя.",
    "💎 Рутина — оружие победителя.",
    "🦁 Лев не спрашивает разрешения.",
  ],
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { subscriptions, title, body, type } = req.body;

  if (!subscriptions || !subscriptions.length) {
    return res.status(200).json({ sent: 0 });
  }

  let sent = 0;
  const results = [];

  for (const sub of subscriptions) {
    const lang = sub.lang || 'de';
    let notifBody = body;

    // For daily motivation, pick random message in user's language
    if (type === 'daily') {
      const msgs = MOTIVATIONS[lang] || MOTIVATIONS.de;
      notifBody = msgs[Math.floor(Math.random() * msgs.length)];
    }

    try {
      await webpush.sendNotification(
        sub.subscription,
        JSON.stringify({
          title: title || 'MANPOWER BRUDERSCHAFT',
          body: notifBody,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: type || 'general',
        })
      );
      sent++;
    } catch (err) {
      results.push({ error: err.message, endpoint: sub.subscription?.endpoint?.slice(-20) });
    }
  }

  return res.status(200).json({ sent, total: subscriptions.length, errors: results });
}
