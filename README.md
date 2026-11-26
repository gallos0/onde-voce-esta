ONDE VOCÊ ESTÁ?
================

Jogo bíblico de "achar o personagem" no estilo *Onde está Wally?*, num mundo aberto que vai sendo liberado região por região, do Jardim do Éden à terra a leste do Éden.

- **index.html**: versão principal, com gráficos realistas (three.js / WebGL2). É um arquivo único e funciona offline.
- **en.html**: versão em inglês (a tela inicial deixa escolher ENGLISH ou PORTUGUÊS).
- **classico.html**: versão clássica mais leve, para celulares mais antigos.

História em 35 fases:
- 1 a 19: do Jardim do Éden à terra a leste do Éden, com as visitas de Deus (5º, 15º, 25º acerto seguido…); no 15º, Deus traz Eva.
- 20: cena da tentação (a serpente, Eva, o fruto, Adão) com música de suspense; o jardim seca diante do jogador.
- 21 a 25: o jardim caído (árvores mortas, terra rachada, animais magros e deitados), dificuldade extrema.
- 26 a 29: chegam Caim e Abel; é preciso achar os quatro.
- 30: missão de esconder Abel de Caim por 10 segundos, com dois desfechos.
- 31 a 34: só o irmão que ficou.
- 35: a expulsão do jardim e o fim.

Qualidade gráfica: ultra (computador, com pós-processamento), alto (celular) e leve. A resolução se ajusta sozinha.

Arte e voz:
- Personagens, animais e cenários pintados a partir das folhas de conceito enviadas pelo autor do jogo (pasta img/).
- Narração gerada com o Kokoro-82M (licença Apache-2.0), voz pm_alex em português e bm_george em inglês, com o tom engrossado e um pouco de eco (pasta voice/).

## App no iPhone

- **Pelo Safari (mais simples):** abra o site, toque em Compartilhar → *Adicionar à Tela de Início*. O jogo abre em tela cheia, com ícone próprio, e funciona offline depois da primeira vez.
- **App nativo (.ipa):** o workflow `iOS app (.ipa)` compila `ios-app/` (Capacitor) num Mac do GitHub a cada atualização do jogo e publica o arquivo na release `ios`. O .ipa sai sem assinatura: instale com Sideloadly ou AltStore usando seu Apple ID, ou abra `ios-app/ios/App/App.xcodeproj` no Xcode, escolha seu time em *Signing* e rode no iPhone.
