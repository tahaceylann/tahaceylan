// Demo bot hesaplar (gerçek kişi değildir)
// Demo profiller (gerçek kişi değildir)
const _P = (id,ad,yas,cins,sehir,meslek,boy,burc,hedef,sigara,alkol,emoji,renk,hakkinda,ilgi,dogrulanmis) =>
  ({id,ad,yas,cins,sehir,meslek,boy,burc,hedef,sigara,alkol,emoji,renk,hakkinda,ilgi,dogrulanmis});
const PROFILLER = [
  _P("k1","Elif",26,"kadin","İstanbul","Grafik tasarımcı",168,"Yengeç","Ciddi ilişki","İçmiyor","Sosyal","👩‍🎨",210,"Kadıköy'de kahve, Moda'da gün batımı. Kedim Pamuk'la yaşıyorum, onu sevmeyen eleniyor 🐈",["Kahve","Kedi","Fotoğraf","Sinema","Sahil yürüyüşü"],true),
  _P("k2","Zeynep",24,"kadin","Ankara","Hemşire",165,"Başak","Evlilik odaklı","İçmiyor","İçmiyor","👩‍⚕️",340,"Nöbetten çıkınca uyumak istiyorum ama güzel bir kahvaltıya hayır demem. Samimi insanlar arıyorum.",["Kahvaltı","Doğa yürüyüşü","Kitap","Yemek yapmak"],true),
  _P("k3","Defne",28,"kadin","İzmir","Mimar",172,"Terazi","Ciddi ilişki","İçmiyor","Sosyal","🏛️",15,"Alsancak'ta bisikletle gezen mimar. Ege'nin zeytinyağlısı, İzmir'in rüzgarı... Sohbeti iyi olan biri gelsin.",["Bisiklet","Seyahat","Resim","Konser","Kahve"],true),
  _P("k4","Selin",25,"kadin","İstanbul","Yazılım geliştirici",170,"Kova","Henüz emin değilim","İçmiyor","Sosyal","👩‍💻",265,"Gündüz kod, gece dizi maratonu. Teknoloji ve oyun konuşabilecek biri varsa selam 🎮",["Oyun","Teknoloji","Dizi","Kahve","Karaoke"],false),
  _P("k5","Ayşe",30,"kadin","Bursa","Öğretmen",164,"Boğa","Evlilik odaklı","İçmiyor","İçmiyor","📚",120,"Kitap kurdu, yemek sever. İskender'in doğduğu şehirdenim, mutfakta iddialıyım.",["Kitap","Yemek yapmak","Tiyatro","Doğa yürüyüşü"],true),
  _P("k6","Merve",27,"kadin","Antalya","Diş hekimi",169,"Koç","Ciddi ilişki","İçmiyor","Sosyal","🦷",25,"Deniz, güneş, yüzme. Hafta sonu Kaş'a kaçmaya her zaman hazırım 🌊",["Yüzme","Seyahat","Yoga","Sahil yürüyüşü"],true),
  _P("k7","Buse",23,"kadin","Eskişehir","Üniversite öğrencisi",161,"İkizler","Sohbet / arkadaşlık","İçmiyor","Sosyal","🎓",300,"Porsuk kenarında bira değil çay içen nadir öğrencilerden. Konserleri kaçırmam!",["Konser","Müzik","Gitar","Dans","Fotoğraf"],false),
  _P("k8","Ceren",29,"kadin","Gaziantep","Gıda mühendisi",166,"Aslan","Ciddi ilişki","İçmiyor","İçmiyor","🥮",40,"Baklavanın başkentinden selamlar. Yemek yapmayı da yedirmeyi de severim 😄",["Yemek yapmak","Kahvaltı","Seyahat","Kedi"],true),
  _P("k9","Gizem",31,"kadin","Kocaeli","Avukat",171,"Akrep","Evlilik odaklı","İçmiyor","İçmiyor","⚖️",350,"Dürüstlük benim için her şey. Net ve samimi biriyle tanışmak isterim.",["Kitap","Sinema","Fitness","Kahve"],true),
  _P("k10","İrem",25,"kadin","Trabzon","Psikolog",167,"Yay","Henüz emin değilim","İçmiyor","Sosyal","🧠",190,"Karadeniz kızı: yaylalar, horon ve mısır ekmeği. Sohbetin derinine inmeyi severim.",["Doğa yürüyüşü","Dans","Kamp","Kitap"],false),
  _P("k11","Naz",26,"kadin","Muğla","Yoga eğitmeni",174,"Balık","Sohbet / arkadaşlık","İçmiyor","Nadiren","🧘‍♀️",280,"Bodrum'da sabah yogası, akşam deniz. Huzurlu enerjili insanlar beni bulsun.",["Yoga","Yüzme","Seyahat","Fotoğraf"],true),
  _P("k12","Ece",22,"kadin","Konya","Eczacılık öğrencisi",160,"Oğlak","Evlilik odaklı","İçmiyor","İçmiyor","💊",70,"Sakin, aile bağlılığı yüksek biriyim. Etli ekmek mi mantı mı tartışmasına hazırım!",["Yemek yapmak","Kitap","Kedi","Kahvaltı"],false),
  _P("e1","Can",28,"erkek","İstanbul","Yazılım mühendisi",182,"Aslan","Ciddi ilişki","İçmiyor","Sosyal","👨‍💻",220,"Boğaz'da motor turu, hafta sonu kahve. Kedi mi köpek mi? İkisi de ❤️",["Teknoloji","Motosiklet","Kahve","Köpek","Sinema"],true),
  _P("e2","Emre",30,"erkek","Ankara","Doktor",185,"Başak","Evlilik odaklı","İçmiyor","İçmiyor","👨‍⚕️",150,"Yoğun ama vaktini doğru yere ayıran biri. Basketbol ve iyi bir kahvaltı en büyük zaafım.",["Basketbol","Kahvaltı","Kitap","Seyahat"],true),
  _P("e3","Mert",27,"erkek","İzmir","Fotoğrafçı",178,"Kova","Henüz emin değilim","İçmiyor","Sosyal","📷",205,"Gün batımı avcısı. Fotoğraf makinem çantamda, yeni yerler keşfetmeye hazırım.",["Fotoğraf","Seyahat","Kamp","Müzik","Gitar"],false),
  _P("e4","Burak",29,"erkek","Antalya","Spor eğitmeni",188,"Koç","Ciddi ilişki","İçmiyor","İçmiyor","🏋️",10,"Sabah 6'da salonda, akşam sahilde. Sağlıklı yaşamı birlikte paylaşalım 💪",["Fitness","Yüzme","Futbol","Yemek yapmak"],true),
  _P("e5","Kerem",26,"erkek","Bursa","Makine mühendisi",180,"İkizler","Sohbet / arkadaşlık","İçmiyor","Sosyal","⚙️",235,"Uludağ'da kayak, Cumalıkızık'ta kahvaltı. Tavlada beni yenebilirsen kahve benden 😎",["Tavla","Kahvaltı","Futbol","Oyun"],false),
  _P("e6","Oğuz",32,"erkek","Kayseri","Girişimci",183,"Oğlak","Evlilik odaklı","İçmiyor","İçmiyor","💼",160,"Kendi işimin patronuyum ama kalbim boş koltukta. Aileme önem veririm, mantı konusunda uzmanız.",["Girişimcilik","Yemek yapmak","Seyahat","Balık tutmak"],true),
  _P("e7","Barış",25,"erkek","Eskişehir","Müzisyen",176,"Balık","Sohbet / arkadaşlık","İçmiyor","Sosyal","🎸",290,"Gitarım, ben ve bitmeyen şarkılar. Beraber konsere gidecek birini arıyorum.",["Gitar","Müzik","Konser","Karaoke","Sinema"],false),
  _P("e8","Arda",24,"erkek","İstanbul","Üniversite öğrencisi",179,"Yay","Henüz emin değilim","İçmiyor","Sosyal","🎮",255,"Fenerbahçe tutkunu, oyun delisi. Tribünde buluşalım mı? 😄",["Futbol","Oyun","Dizi","Basketbol"],false),
  _P("e9","Tolga",31,"erkek","Samsun","Pilot",184,"Terazi","Ciddi ilişki","İçmiyor","Sosyal","✈️",200,"Dünyanın yarısını gördüm, şimdi birini bulup diğer yarısını birlikte görmek istiyorum.",["Seyahat","Fotoğraf","Kahve","Sinema"],true),
  _P("e10","Yusuf",28,"erkek","Konya","Öğretmen",177,"Akrep","Evlilik odaklı","İçmiyor","İçmiyor","🕌",95,"Sade, dürüst, sorumluluk sahibi biriyim. Niyeti ciddi olanlarla tanışmak isterim.",["Kitap","Doğa yürüyüşü","Kahvaltı","Yemek yapmak"],true),
  _P("e11","Cem",27,"erkek","Muğla","Dalış eğitmeni",181,"Yengeç","Ciddi ilişki","İçmiyor","Sosyal","🤿",185,"Deniz benim ofisim. Dalışa gelmek isteyen, denizi seven biri olsun.",["Yüzme","Balık tutmak","Seyahat","Kamp"],true),
  _P("e12","Alper",33,"erkek","Adana","Avukat",180,"Boğa","Evlilik odaklı","İçmiyor","İçmiyor","👔",30,"Adana kebap ve şalgam eşliğinde sohbet için ideal biriyim 😅 Ciddiyim, oyun oynamam.",["Yemek yapmak","Sinema","Futbol","Kahve"],false)
];

module.exports = PROFILLER;
