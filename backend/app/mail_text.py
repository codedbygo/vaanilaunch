"""Owner emails in the owner's language, with the English text underneath.

The owner's language is the store's first content language (the agent writes it first). The
English copy stays below because the same mail is copied to the platform inbox and because these
translations are machine drafts awaiting native review. Item lines and amounts are not translated,
and the UPI note stays "Order <ref>": that is the exact text the customer typed into their UPI app.
"""
from .site_render import as_dict, as_list

_T: dict[str, dict[str, str]] = {
    "en": {
        "subject": "🛒 New order {ref} – ₹{total}",
        "intro": "New order {ref} for {store}",
        "total": "Total: ₹{total}",
        "payment": "Payment: pending (check your UPI app for ₹{total} with note 'Order {ref}')",
        "phone": "Customer phone: {phone}",
        "warning": "--- Written by the customer, not by VaaniLaunch. Don't open links you don't trust. ---",
        "name": "Name",
        "note": "Note",
        "confirm_subject": "Confirm your VaaniLaunch order email",
        "confirm": "Please confirm that order emails for your VaaniLaunch store '{slug}' should come to "
                   "this address:\n\n{link}\n\nIf you didn't set up this store, ignore this email and "
                   "nothing will be sent to you.",
    },
    "te": {
        "subject": "🛒 కొత్త ఆర్డర్ {ref} – ₹{total}",
        "intro": "{store} కి కొత్త ఆర్డర్ {ref}",
        "total": "మొత్తం: ₹{total}",
        "payment": "చెల్లింపు: పెండింగ్ ('Order {ref}' నోట్‌తో ₹{total} వచ్చిందో మీ UPI యాప్‌లో చూడండి)",
        "phone": "కస్టమర్ ఫోన్: {phone}",
        "warning": "--- ఇది కస్టమర్ రాసింది, VaaniLaunch కాదు. నమ్మకం లేని లింక్‌లు తెరవకండి. ---",
        "name": "పేరు",
        "note": "నోట్",
        "confirm_subject": "మీ VaaniLaunch ఆర్డర్ ఈమెయిల్ నిర్ధారించండి",
        "confirm": "మీ VaaniLaunch స్టోర్ '{slug}' ఆర్డర్ ఈమెయిల్స్ ఈ చిరునామాకు రావాలని నిర్ధారించండి:\n\n"
                   "{link}\n\nమీరు ఈ స్టోర్ తయారు చేయకపోతే, ఈ ఈమెయిల్‌ను పట్టించుకోకండి; మీకు ఏమీ రాదు.",
    },
    "hi": {
        "subject": "🛒 नया ऑर्डर {ref} – ₹{total}",
        "intro": "{store} के लिए नया ऑर्डर {ref}",
        "total": "कुल: ₹{total}",
        "payment": "भुगतान: बाकी (अपने UPI ऐप में 'Order {ref}' नोट के साथ ₹{total} देखें)",
        "phone": "ग्राहक का फ़ोन: {phone}",
        "warning": "--- यह ग्राहक ने लिखा है, VaaniLaunch ने नहीं। अनजान लिंक न खोलें। ---",
        "name": "नाम",
        "note": "नोट",
        "confirm_subject": "अपना VaaniLaunch ऑर्डर ईमेल पक्का करें",
        "confirm": "कृपया पक्का करें कि आपके VaaniLaunch स्टोर '{slug}' के ऑर्डर ईमेल इस पते पर आएँ:\n\n"
                   "{link}\n\nअगर यह स्टोर आपने नहीं बनाया, तो इस ईमेल को अनदेखा करें; आपको कुछ नहीं भेजा जाएगा।",
    },
    "ta": {
        "subject": "🛒 புதிய ஆர்டர் {ref} – ₹{total}",
        "intro": "{store} க்கு புதிய ஆர்டர் {ref}",
        "total": "மொத்தம்: ₹{total}",
        "payment": "பணம்: நிலுவையில் ('Order {ref}' குறிப்புடன் ₹{total} வந்ததா என உங்கள் UPI ஆப்பில் பாருங்கள்)",
        "phone": "வாடிக்கையாளர் போன்: {phone}",
        "warning": "--- இதை எழுதியது வாடிக்கையாளர், VaaniLaunch அல்ல. நம்பிக்கையில்லாத இணைப்புகளைத் திறக்காதீர்கள். ---",
        "name": "பெயர்",
        "note": "குறிப்பு",
        "confirm_subject": "உங்கள் VaaniLaunch ஆர்டர் மின்னஞ்சலை உறுதி செய்யுங்கள்",
        "confirm": "உங்கள் VaaniLaunch கடை '{slug}' இன் ஆர்டர் மின்னஞ்சல்கள் இந்த முகவரிக்கு வர வேண்டும் என்பதை "
                   "உறுதி செய்யுங்கள்:\n\n{link}\n\nநீங்கள் இந்தக் கடையை உருவாக்கவில்லை என்றால், இந்த "
                   "மின்னஞ்சலைப் புறக்கணியுங்கள்; உங்களுக்கு எதுவும் அனுப்பப்படாது.",
    },
    "kn": {
        "subject": "🛒 ಹೊಸ ಆರ್ಡರ್ {ref} – ₹{total}",
        "intro": "{store} ಗೆ ಹೊಸ ಆರ್ಡರ್ {ref}",
        "total": "ಒಟ್ಟು: ₹{total}",
        "payment": "ಪಾವತಿ: ಬಾಕಿ ('Order {ref}' ಟಿಪ್ಪಣಿಯೊಂದಿಗೆ ₹{total} ಬಂದಿದೆಯೇ ನಿಮ್ಮ UPI ಆ್ಯಪ್‌ನಲ್ಲಿ ನೋಡಿ)",
        "phone": "ಗ್ರಾಹಕರ ಫೋನ್: {phone}",
        "warning": "--- ಇದನ್ನು ಬರೆದದ್ದು ಗ್ರಾಹಕರು, VaaniLaunch ಅಲ್ಲ. ನಂಬಿಕೆಯಿಲ್ಲದ ಲಿಂಕ್ ತೆರೆಯಬೇಡಿ. ---",
        "name": "ಹೆಸರು",
        "note": "ಟಿಪ್ಪಣಿ",
        "confirm_subject": "ನಿಮ್ಮ VaaniLaunch ಆರ್ಡರ್ ಇಮೇಲ್ ಖಚಿತಪಡಿಸಿ",
        "confirm": "ನಿಮ್ಮ VaaniLaunch ಅಂಗಡಿ '{slug}' ನ ಆರ್ಡರ್ ಇಮೇಲ್‌ಗಳು ಈ ವಿಳಾಸಕ್ಕೆ ಬರಬೇಕು ಎಂದು ಖಚಿತಪಡಿಸಿ:\n\n"
                   "{link}\n\nನೀವು ಈ ಅಂಗಡಿ ಮಾಡಿಲ್ಲದಿದ್ದರೆ, ಈ ಇಮೇಲ್ ಅನ್ನು ನಿರ್ಲಕ್ಷಿಸಿ; ನಿಮಗೆ ಏನೂ ಬರುವುದಿಲ್ಲ.",
    },
    "ml": {
        "subject": "🛒 പുതിയ ഓർഡർ {ref} – ₹{total}",
        "intro": "{store}-ന് പുതിയ ഓർഡർ {ref}",
        "total": "ആകെ: ₹{total}",
        "payment": "പണം: ബാക്കി ('Order {ref}' കുറിപ്പോടെ ₹{total} വന്നോ എന്ന് നിങ്ങളുടെ UPI ആപ്പിൽ നോക്കൂ)",
        "phone": "ഉപഭോക്താവിന്റെ ഫോൺ: {phone}",
        "warning": "--- ഇത് എഴുതിയത് ഉപഭോക്താവാണ്, VaaniLaunch അല്ല. വിശ്വാസമില്ലാത്ത ലിങ്കുകൾ തുറക്കരുത്. ---",
        "name": "പേര്",
        "note": "കുറിപ്പ്",
        "confirm_subject": "നിങ്ങളുടെ VaaniLaunch ഓർഡർ ഇമെയിൽ ഉറപ്പിക്കൂ",
        "confirm": "നിങ്ങളുടെ VaaniLaunch കട '{slug}'-ന്റെ ഓർഡർ ഇമെയിലുകൾ ഈ വിലാസത്തിലേക്ക് വരണമെന്ന് ഉറപ്പിക്കൂ:\n\n"
                   "{link}\n\nനിങ്ങൾ ഈ കട ഉണ്ടാക്കിയില്ലെങ്കിൽ, ഈ ഇമെയിൽ അവഗണിക്കൂ; നിങ്ങൾക്ക് ഒന്നും അയയ്ക്കില്ല.",
    },
    "mr": {
        "subject": "🛒 नवीन ऑर्डर {ref} – ₹{total}",
        "intro": "{store} साठी नवीन ऑर्डर {ref}",
        "total": "एकूण: ₹{total}",
        "payment": "पेमेंट: बाकी (तुमच्या UPI अ‍ॅपमध्ये 'Order {ref}' नोटसह ₹{total} आले का ते पहा)",
        "phone": "ग्राहकाचा फोन: {phone}",
        "warning": "--- हे ग्राहकाने लिहिले आहे, VaaniLaunch ने नाही. अनोळखी लिंक उघडू नका. ---",
        "name": "नाव",
        "note": "नोट",
        "confirm_subject": "तुमचा VaaniLaunch ऑर्डर ईमेल निश्चित करा",
        "confirm": "तुमच्या VaaniLaunch दुकान '{slug}' चे ऑर्डर ईमेल या पत्त्यावर यावेत हे निश्चित करा:\n\n"
                   "{link}\n\nतुम्ही हे दुकान बनवले नसेल, तर या ईमेलकडे दुर्लक्ष करा; तुम्हाला काहीही पाठवले जाणार नाही.",
    },
    "bn": {
        "subject": "🛒 নতুন অর্ডার {ref} – ₹{total}",
        "intro": "{store}-এর নতুন অর্ডার {ref}",
        "total": "মোট: ₹{total}",
        "payment": "পেমেন্ট: বাকি ('Order {ref}' নোট দিয়ে ₹{total} এসেছে কি না আপনার UPI অ্যাপে দেখুন)",
        "phone": "ক্রেতার ফোন: {phone}",
        "warning": "--- এটি ক্রেতার লেখা, VaaniLaunch-এর নয়। অচেনা লিংক খুলবেন না। ---",
        "name": "নাম",
        "note": "নোট",
        "confirm_subject": "আপনার VaaniLaunch অর্ডার ইমেল নিশ্চিত করুন",
        "confirm": "আপনার VaaniLaunch দোকান '{slug}'-এর অর্ডার ইমেল এই ঠিকানায় আসবে, তা নিশ্চিত করুন:\n\n"
                   "{link}\n\nআপনি এই দোকান না বানিয়ে থাকলে এই ইমেলটি উপেক্ষা করুন; আপনাকে কিছু পাঠানো হবে না।",
    },
    "gu": {
        "subject": "🛒 નવો ઓર્ડર {ref} – ₹{total}",
        "intro": "{store} માટે નવો ઓર્ડર {ref}",
        "total": "કુલ: ₹{total}",
        "payment": "ચુકવણી: બાકી (તમારી UPI એપમાં 'Order {ref}' નોંધ સાથે ₹{total} આવ્યા કે નહીં તે જુઓ)",
        "phone": "ગ્રાહકનો ફોન: {phone}",
        "warning": "--- આ ગ્રાહકે લખ્યું છે, VaaniLaunch એ નહીં. અજાણી લિંક ખોલશો નહીં. ---",
        "name": "નામ",
        "note": "નોંધ",
        "confirm_subject": "તમારો VaaniLaunch ઓર્ડર ઇમેઇલ પુષ્ટિ કરો",
        "confirm": "તમારી VaaniLaunch દુકાન '{slug}' ના ઓર્ડર ઇમેઇલ આ સરનામે આવે તેની પુષ્ટિ કરો:\n\n"
                   "{link}\n\nજો તમે આ દુકાન બનાવી ન હોય, તો આ ઇમેઇલ અવગણો; તમને કંઈ મોકલવામાં નહીં આવે.",
    },
}


def owner_lang(site: dict) -> str:
    """The store's first content language, as one of ours ("te-IN" and "te" both give "te")."""
    for block in as_list(site.get("content")):
        code = str(as_dict(block).get("lang_code") or "").lower().split("-")[0].split("_")[0]
        return code if code in _T else "en"
    return "en"


def _both(lang: str, render) -> str:
    """The owner's language first, then English (once, when the owner's language is English)."""
    own = render(_T[lang])
    return own if lang == "en" else f"{own}\n\n— English —\n\n{render(_T['en'])}"


def _label(lang: str, key: str) -> str:
    return _T[lang][key] if lang == "en" else f"{_T[lang][key]} / {_T['en'][key]}"


def order_mail(site: dict, ref: str, item_lines: str, total: float, phone: str, name: str,
               note: str) -> tuple[str, str]:
    """Subject and body of a new-order alert. What the customer wrote appears once, at the end,
    below the warning in both languages, so an untrusted link is never repeated or unlabelled."""
    lang = owner_lang(site)
    t, store = f"{total:g}", str(site.get("business_name") or "")

    def ours(m: dict[str, str]) -> str:
        return (f"{m['intro'].format(ref=ref, store=store)}\n\n{item_lines}\n\n"
                f"{m['total'].format(total=t)}\n{m['payment'].format(ref=ref, total=t)}\n\n"
                f"{m['phone'].format(phone=phone)}")
    warning = _T[lang]["warning"] if lang == "en" else f"{_T[lang]['warning']}\n{_T['en']['warning']}"
    customer = (f"{warning}\n{_label(lang, 'name')}: {name}\n"
                f"{_label(lang, 'note')}: {note or '-'}\n")
    return _T[lang]["subject"].format(ref=ref, total=t), f"{_both(lang, ours)}\n\n{customer}"


def confirm_mail(site: dict, slug: str, link: str) -> tuple[str, str]:
    """Subject and body of the owner-email confirmation."""
    lang = owner_lang(site)
    return _T[lang]["confirm_subject"], _both(lang, lambda m: m["confirm"].format(slug=slug, link=link))
