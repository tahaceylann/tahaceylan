// Örnek veri: şehirler, ilgi alanları, burçlar ve demo profiller
const ILLER = ["Adana","Ankara","Antalya","Aydın","Balıkesir","Bursa","Denizli","Diyarbakır","Edirne","Erzurum","Eskişehir","Gaziantep","Hatay","Isparta","İstanbul","İzmir","Kayseri","Kocaeli","Konya","Malatya","Manisa","Mardin","Mersin","Muğla","Ordu","Sakarya","Samsun","Tekirdağ","Trabzon","Van","Diğer"];
const ILGILER = ["Kahve","Seyahat","Müzik","Sinema","Dizi","Kitap","Yemek yapmak","Spor","Fitness","Yoga","Doğa yürüyüşü","Kamp","Fotoğraf","Oyun","Basketbol","Futbol","Konser","Tiyatro","Kedi","Köpek","Dans","Resim","Gitar","Yüzme","Bisiklet","Sahil yürüyüşü","Tavla","Kahvaltı","Girişimcilik","Teknoloji","Moda","Karaoke","Balık tutmak","Motosiklet"];
const HEDEFLER = ["Ciddi ilişki","Evlilik odaklı","Sohbet / arkadaşlık","Henüz emin değilim"];
const BURCLAR = [
  ["Oğlak","♑",[12,22],[1,19],"toprak"],["Kova","♒",[1,20],[2,18],"hava"],["Balık","♓",[2,19],[3,20],"su"],
  ["Koç","♈",[3,21],[4,19],"ates"],["Boğa","♉",[4,20],[5,20],"toprak"],["İkizler","♊",[5,21],[6,20],"hava"],
  ["Yengeç","♋",[6,21],[7,22],"su"],["Aslan","♌",[7,23],[8,22],"ates"],["Başak","♍",[8,23],[9,22],"toprak"],
  ["Terazi","♎",[9,23],[10,22],"hava"],["Akrep","♏",[10,23],[11,21],"su"],["Yay","♐",[11,22],[12,21],"ates"]];
const BURC_ELEMENT = Object.fromEntries(BURCLAR.map(b => [b[0], b[4]]));
const BURC_SIMGE = Object.fromEntries(BURCLAR.map(b => [b[0], b[1]]));
const BURC_ADLARI = BURCLAR.map(b => b[0]);
function burcBul(ay, gun) {
  for (const [ad,, bas, son] of BURCLAR) {
    if ((ay === bas[0] && gun >= bas[1]) || (ay === son[0] && gun <= son[1])) return ad;
  }
  return "Oğlak";
}
const BURC_YORUM = {
  "ates-ates":"İki ateş: tutkulu ve hareketli bir ilişki, yalnız ego çatışmasına dikkat.",
  "toprak-toprak":"Sağlam zemin: sadık, güvenilir ve geleceğe dönük bir ikili.",
  "hava-hava":"Bitmeyen sohbet! Zihinleriniz çok iyi anlaşır.",
  "su-su":"Duygusal derinlik yüksek; birbirinizi sözsüz anlarsınız.",
  "ates-hava":"Hava ateşi besler: eğlenceli, enerjik ve özgür bir uyum.",
  "toprak-su":"Su toprağı besler: huzurlu ve şefkatli bir uyum.",
  "ates-su":"Zıt güçler: çekim var ama anlaşmak için emek gerekir.",
  "ates-toprak":"Farklı tempolar; sabır ve karşılıklı saygı şart.",
  "hava-toprak":"Biri hayalci, biri pratik; birbirinizden çok şey öğrenebilirsiniz.",
  "hava-su":"Mantık ve duygu dengesi; açık iletişim önemli."
};
// Profiller artık sunucudan gelir (demo profiller server/botlar.js içindedir)
const PROFILLER = [];
if (typeof module !== "undefined") module.exports = { ILLER, ILGILER, HEDEFLER, BURC_ELEMENT, burcBul };
