// Mutfak paneli kayıt kuyruğu (istemci). Her kayıt telefonda kalıcı bir kimlikle saklanır;
// sunucu açıkça "kaydedildi" demeden başarılı sayılmaz. Aynı kimlik tekrar gönderilirse sunucu ikinci kayıt açmaz,
// bu yüzden bağlantı hatasında yeniden göndermek güvenlidir (CLAUDE.md kural 6'nın gerekçesi kimlikle kalkar).
// Durumlar: BEKLIYOR (telefonda) → KAYDEDILDI (sunucu onayı) | HATA (sunucu reddetti, insan bakmalı)

function kuyrukOlustur(secenek) {
  const depo = secenek.depo;          // { oku(): [], yaz(liste) }  — tarayıcıda localStorage
  const gonder = secenek.gonder;      // (govde) => Promise<{ status, json }>; ağ hatasında throw
  const kimlikUret = secenek.kimlikUret;
  const simdi = secenek.simdi || (() => new Date().toISOString());

  function ekle(govde) {
    const liste = depo.oku();
    const kayit = { id: govde.id || kimlikUret(), durum: 'BEKLIYOR', deneme: 0, eklendi: simdi(), mesaj: '' };
    kayit.govde = Object.assign({}, govde, { id: kayit.id });
    liste.push(kayit);
    depo.yaz(liste);                   // ağa gitmeden ÖNCE telefona yazılır
    return kayit.id;
  }

  async function isle() {
    const liste = depo.oku();
    for (const k of liste) {
      if (k.durum !== 'BEKLIYOR') continue;
      k.deneme++;
      let cevap;
      try {
        cevap = await gonder(k.govde);
      } catch (e) {
        k.mesaj = 'Bağlantı yok, telefonda bekliyor';
        depo.yaz(liste);
        continue;                      // sıradaki denemede aynı kimlikle tekrar gider
      }
      const j = cevap && cevap.json;
      if (cevap.status === 200 && j && (j.durum === 'KAYDEDILDI' || j.durum === 'ZATEN_KAYITLI') && j.id === k.id) {
        k.durum = 'KAYDEDILDI'; k.sira = j.sira; k.mesaj = 'Sunucuya kaydedildi';
      } else if (cevap.status >= 400 && cevap.status < 500) {
        k.durum = 'HATA'; k.mesaj = (j && j.hata) || ('Sunucu reddetti (' + cevap.status + ')');
      } else {
        k.mesaj = 'Sunucu cevap vermedi, telefonda bekliyor';   // 5xx ya da bozuk cevap: tekrar denenecek
      }
      depo.yaz(liste);
    }
    return depo.oku();
  }

  return { ekle, isle, liste: () => depo.oku() };
}

if (typeof module !== 'undefined') module.exports = { kuyrukOlustur };
