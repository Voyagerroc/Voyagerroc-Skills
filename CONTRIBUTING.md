# Katkıda Bulunma Rehberi (Contributing)

Voyagerroc Antigravity Skills projesine katkıda bulunmak istediğiniz için teşekkür ederiz! Bu depo, Google Antigravity ve benzeri AI sistemleri için güçlü yeteneklerin (skills) paylaşıldığı açık kaynaklı bir topluluk projesidir.

## Yeni Bir Skill Nasıl Eklenir?

Yeni bir yetenek eklemek için lütfen aşağıdaki adımları izleyin:

1. **Klasör Oluşturun:**
   `skills/` dizini altında yeteneğinizin adıyla yeni bir klasör oluşturun. (Örn: `skills/my-awesome-skill`)

2. **SKILL.md Dosyası:**
   Klasörün içine `SKILL.md` adlı bir dosya oluşturun. Bu dosyanın en üstünde YAML formatında meta veriler (name, description) bulunmalıdır:
   ```markdown
   ---
   name: my-awesome-skill
   description: Bu skill, harika işlemler yapmanızı sağlar. Sadece X durumunda kullanın.
   ---
   # My Awesome Skill
   
   ## Use this skill when
   - X yapmak istediğinizde
   
   ## Do not use this skill when
   - Y yapmak istediğinizde
   
   ## Instructions
   1. Adım bir
   2. Adım iki
   ```

3. **Gerekli Kaynaklar (Opsiyonel):**
   Eğer skill'inizin ek scriptlere veya dokümanlara ihtiyacı varsa, skill klasörü altında `scripts/`, `references/` veya `assets/` klasörleri oluşturabilirsiniz.

4. **Kataloğu Güncelleyin:**
   Yeni skill eklendikten sonra ana dizinde şu komutu çalıştırarak kataloğu güncelleyin:
   ```bash
   npm run build:catalog
   ```

5. **Testleri ve Validasyonu Çalıştırın:**
   Göndermeden önce kodunuzun yapısal olarak doğru olduğundan emin olun:
   ```bash
   npm run validate:skills
   npm test
   npm run check:catalog
   ```

## Pull Request Süreci

- Her zaman yeni bir branch açarak (örneğin: `feature/new-skill-name`) çalışın.
- Kodlarınızı gönderirken `PULL_REQUEST_TEMPLATE` içindeki alanları eksiksiz doldurun.
- Tüm testlerin (özellikle `npm run validate:skills`) başarılı olduğundan emin olun.

Katkılarınız için şimdiden teşekkürler!
